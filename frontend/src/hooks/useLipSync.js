
import { useState, useRef, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import { PHONEME_TO_VISEME, VISEME_TO_SHAPES, ALL_SHAPE_KEYS } from '../utils/lipSyncMappings';
import { PHONEME_TO_SHAPE_KEYS } from '../utils/phonemeShapeKeys';
import { createVisemeTimeline, backendVisemesToTimeline, groupedVisemesToTimeline } from '../utils/lipSyncScheduler';
import { textToAudioVisemesAPI } from '../utils/visemeUtils';
import { clampMorphInfluence } from '../utils/morphUtils';

const normalizeMorphKey = (key = '') => String(key).toLowerCase().replace(/[^a-z0-9]/g, '');

const MORPH_ALIASES = {
    Lips_Open_Wide: ['Lips_Open_wide', 'Lips_OpenWide'],
    Lips_Corner_Up: ['Lip_Corner_Up', 'LipsCornerUp'],
    TeethTongue_TipUp: ['TeethTongue _TipUP', 'TeethTongue_TipUP', 'Teethtongue_TipUp'],
    TeethTongue_Bite: ['Teethtongue_Bite', 'TeethTongue_Bite'],
};

const getMorphIndex = (dict, key) => {
    if (!dict) return undefined;
    if (dict[key] !== undefined) return dict[key];

    const aliases = MORPH_ALIASES[key] || [];
    for (const alias of aliases) {
        if (dict[alias] !== undefined) return dict[alias];
    }

    const normalizedTarget = normalizeMorphKey(key);
    for (const [candidate, index] of Object.entries(dict)) {
        if (normalizeMorphKey(candidate) === normalizedTarget) return index;
    }

    for (const alias of aliases) {
        const normalizedAlias = normalizeMorphKey(alias);
        for (const [candidate, index] of Object.entries(dict)) {
            if (normalizeMorphKey(candidate) === normalizedAlias) return index;
        }
    }

    return undefined;
};


/**
 * Hook to manage real-time lip sync animation
 * @param {Object} headMeshRef - React Ref to the head mesh
 * @param {Object} teethMeshRef - React Ref to the teeth mesh (optional)
 * @param {Function} onStart - Callback when speech starts
 * @param {Function} onEnd - Callback when speech ends
 */
export const useLipSync = (headMeshRef, teethMeshRef, onStart, onEnd) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);
    const externalAudioContextRef = useRef(null);
    const externalSourceRef = useRef(null);
    const externalAnalyserRef = useRef(null);
    const externalSamplesRef = useRef(null);
    const externalFreqSamplesRef = useRef(null);
    const externalLevelRef = useRef(0);
    const externalActiveRef = useRef(false);
    const externalNoiseFloorRef = useRef(0.006);
    const externalSpeakingRef = useRef(false);
    const externalLastSpeechAtRef = useRef(0);
    const externalResumeHandlerRef = useRef(null);
    const timelineRef = useRef([]);
    const durationRatio = useRef(1.0);
    const currentEventIndex = useRef(0);
    const speechId = useRef(0);
    const animationStartTime = useRef(0); // Track when animation started
    const isPlayingRef = useRef(false);
    const LEAD_IN_TIME = 0.04;

    // Store callbacks in refs
    const onStartRef = useRef(onStart);
    const onEndRef = useRef(onEnd);

    useEffect(() => {
        onStartRef.current = onStart;
    }, [onStart]);

    useEffect(() => {
        onEndRef.current = onEnd;
    }, [onEnd]);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    // Reset morph targets to 0
    const resetMorphTargets = useCallback(() => {
        if (!headMeshRef.current) return;

        const hDict = headMeshRef.current.morphTargetDictionary;
        const hInfl = headMeshRef.current.morphTargetInfluences;
        const tDict = teethMeshRef.current?.morphTargetDictionary;
        const tInfl = teethMeshRef.current?.morphTargetInfluences;

        // Debug: Log available keys on first run if needed
        if (!window.debugKeysLogged) {
            console.log("🔍 Model Head Morph Targets:", Object.keys(hDict));
            console.log("🔍 Script Target Keys:", ALL_SHAPE_KEYS);
            window.debugKeysLogged = true;
        }

        if (!hDict || !hInfl) return;

        ALL_SHAPE_KEYS.forEach(key => {
            const headIndex = getMorphIndex(hDict, key);
            if (headIndex !== undefined) hInfl[headIndex] = 0;

            const teethIndex = getMorphIndex(tDict, key);
            if (tInfl && teethIndex !== undefined) {
                tInfl[teethIndex] = 0;
            }
        });
    }, [headMeshRef, teethMeshRef]);

    // Cleanup function
    const cleanup = useCallback(() => {
        const shouldNotifyEnd = isPlayingRef.current || Boolean(audioRef.current);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.onended = null;
            audioRef.current.onplay = null;
            audioRef.current = null;
        }
        setIsPlaying(false);
        isPlayingRef.current = false;
        resetMorphTargets();

        if (shouldNotifyEnd && onEndRef.current) onEndRef.current();
    }, [resetMorphTargets]);

    const stopExternalAudioStream = useCallback(() => {
        const shouldNotifyEnd = externalSpeakingRef.current;
        if (externalResumeHandlerRef.current) {
            window.removeEventListener('pointerdown', externalResumeHandlerRef.current);
            externalResumeHandlerRef.current = null;
        }
        externalSourceRef.current?.disconnect();
        externalSourceRef.current = null;
        externalAnalyserRef.current = null;
        externalSamplesRef.current = null;
        externalFreqSamplesRef.current = null;
        externalLevelRef.current = 0;
        externalActiveRef.current = false;
        externalNoiseFloorRef.current = 0.006;
        externalSpeakingRef.current = false;
        externalLastSpeechAtRef.current = 0;

        if (externalAudioContextRef.current) {
            externalAudioContextRef.current.close().catch(() => { });
            externalAudioContextRef.current = null;
        }

        setIsPlaying(false);
        isPlayingRef.current = false;
        resetMorphTargets();
        if (shouldNotifyEnd && onEndRef.current) onEndRef.current();
    }, [resetMorphTargets]);

    const bindExternalAudioStream = useCallback(async (stream) => {
        stopExternalAudioStream();
        if (!stream) return;

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const audioContext = new AudioContext();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        const resumeContext = () => {
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(() => { });
            }
        };
        externalResumeHandlerRef.current = resumeContext;
        window.addEventListener('pointerdown', resumeContext, { once: true });

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.35;
        source.connect(analyser);

        externalAudioContextRef.current = audioContext;
        externalSourceRef.current = source;
        externalAnalyserRef.current = analyser;
        externalSamplesRef.current = new Uint8Array(analyser.fftSize);
        externalFreqSamplesRef.current = new Uint8Array(analyser.frequencyBinCount);
        externalActiveRef.current = true;
        externalLevelRef.current = 0;
        externalNoiseFloorRef.current = 0.006;
        externalSpeakingRef.current = false;
        externalLastSpeechAtRef.current = performance.now() / 1000;
        setIsPlaying(true);
        isPlayingRef.current = true;
    }, [stopExternalAudioStream]);

    /** Max characters per TTS request to avoid 200+ events and playback failures with long text */
    const MAX_SPEECH_CHARS = 1200;

    const startPlaybackFromData = useCallback(async (data, currentId) => {
        const { audio_url, phonemes, visemes, grouped_visemes } = data || {};

        if (!audio_url) {
            console.warn("No audio_url returned");
            return;
        }

        let timeline;
        if (grouped_visemes && grouped_visemes.length > 0) {
            timeline = groupedVisemesToTimeline(grouped_visemes);
        } else if (visemes && visemes.length > 0) {
            timeline = backendVisemesToTimeline(visemes);
        } else if (phonemes && phonemes.length > 0) {
            timeline = createVisemeTimeline(phonemes);
        } else {
            console.warn("No phonemes, visemes, or grouped_visemes returned for speech.");
            return;
        }

        timelineRef.current = timeline;
        currentEventIndex.current = 0;

        const separator = audio_url.includes('?') ? '&' : '?';
        const cacheBustedUrl = `${audio_url}${separator}_t=${Date.now()}`;

        const audio = new Audio(cacheBustedUrl);
        audio.crossOrigin = "anonymous";
        audio.playbackRate = 1;
        audioRef.current = audio;

        const timelineDuration = timeline.length > 0 ? timeline[timeline.length - 1].endTime : 0;

        audio.onloadedmetadata = () => {
            if (currentId !== speechId.current) return;

            const dur = audio.duration;
            durationRatio.current = timeline.length > 0 && Number.isFinite(dur) && dur > 0
                ? timelineDuration / dur
                : 1.0;
        };

        setIsPlaying(true);
        isPlayingRef.current = true;
        animationStartTime.current = performance.now() / 1000;
        if (onStartRef.current) onStartRef.current();

        audio.onended = () => {
            if (currentId === speechId.current) cleanup();
        };

        setTimeout(async () => {
            if (currentId !== speechId.current) return;
            try {
                await audio.play();
            } catch (error) {
                console.error("Audio play error:", error);
                if (currentId === speechId.current) cleanup();
            }
        }, LEAD_IN_TIME * 1000);
    }, [cleanup]);

    /**
     * Start speaking
     * @param {string} text - Text to speak
     * @param {boolean} isMale - Whether to use the male voice
     */
    const speak = useCallback(async (text, isMale = true) => {
        speechId.current++;
        const currentId = speechId.current;

        if (!text || !String(text).trim()) return;

        // Truncate very long text so one request stays reliable (fewer events, no cache/load issues)
        let speechText = String(text).trim();
        if (speechText.length > MAX_SPEECH_CHARS) {
            speechText = speechText.slice(0, MAX_SPEECH_CHARS).trim() + '…';
            console.warn(`Lip sync: text truncated to ${MAX_SPEECH_CHARS} chars for reliable playback. Split long text into shorter parts to speak more.`);
        }

        // Stop current audio first
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        setIsPlaying(false);

        try {
            const data = await textToAudioVisemesAPI(speechText, isMale);

            if (currentId !== speechId.current) return;

            const { audio_url, phonemes, visemes, grouped_visemes } = data;

            if (!audio_url) {
                console.warn("No audio_url returned");
                return;
            }

            console.log("🗣️ Phonemes List:", phonemes);
            console.log("🔧 Phoneme Shape Keys (dictionary) - Copy and edit in src/utils/phonemeShapeKeys.js:", PHONEME_TO_SHAPE_KEYS);

            // Priority: grouped_visemes (NEW) > visemes > phonemes
            let timeline;
            if (grouped_visemes && grouped_visemes.length > 0) {
                timeline = groupedVisemesToTimeline(grouped_visemes);
                console.log("📅 Using NEW grouped viseme timeline:", timeline.length, "events (merged phoneme groups)");
            } else if (visemes && visemes.length > 0) {
                timeline = backendVisemesToTimeline(visemes);
                console.log("📅 Using backend viseme timing:", timeline.length, "events");
            } else if (phonemes && phonemes.length > 0) {
                timeline = createVisemeTimeline(phonemes);
                console.log("📅 Fallback: phoneme-based timeline:", timeline.length, "events");
            } else {
                console.warn("No phonemes, visemes, or grouped_visemes returned for text.");
                return;
            }
            timelineRef.current = timeline;
            currentEventIndex.current = 0;

            // Cache-bust so long text gets fresh audio (same URL was serving cached short file)
            const separator = audio_url.includes('?') ? '&' : '?';
            const cacheBustedUrl = `${audio_url}${separator}_t=${Date.now()}`;

            // Audio Setup
            const audio = new Audio(cacheBustedUrl);
            audio.crossOrigin = "anonymous";
            audio.playbackRate = 1; // Slow down audio to 80% speed (adjust between 0.1-2.0)
            audioRef.current = audio;

            const timelineDuration = timeline.length > 0 ? timeline[timeline.length - 1].endTime : 0;

            audio.onloadedmetadata = () => {
                if (currentId !== speechId.current) return;

                const dur = audio.duration;
                if (timeline.length > 0 && Number.isFinite(dur) && dur > 0) {
                    durationRatio.current = timelineDuration / dur;
                } else {
                    // Invalid or missing duration (e.g. streaming): assume 1:1 so syncTime = currentTime
                    durationRatio.current = 1.0;
                }
            };

            // Start animation immediately (before audio)
            setIsPlaying(true);
            isPlayingRef.current = true;
            animationStartTime.current = performance.now() / 1000; // Store start time in seconds
            if (onStartRef.current) onStartRef.current();

            const handlePlay = () => {
                if (currentId !== speechId.current) return;
                console.log(`🎬 Audio started - Animation is running ${LEAD_IN_TIME}s ahead throughout speech`);
            };
            audio.addEventListener('play', handlePlay);

            audio.onended = () => {
                if (currentId === speechId.current) {
                    cleanup();
                }
            };

            // Wait for lead-in time, then play audio
            setTimeout(async () => {
                if (currentId !== speechId.current) return;
                try {
                    await audio.play();
                } catch (error) {
                    console.error("Audio play error:", error);
                    if (currentId === speechId.current) {
                        cleanup();
                    }
                }
            }, LEAD_IN_TIME * 1000); // Convert to milliseconds

        } catch (error) {
            if (error.name === 'AbortError' || error.message?.includes('interrupted')) {
                return;
            }
            console.error("LipSync speak error:", error);
            if (currentId === speechId.current) {
                cleanup();
            }
        }
    }, [cleanup]);

    const stop = useCallback(() => {
        speechId.current++;
        stopExternalAudioStream();
        cleanup();
    }, [cleanup, stopExternalAudioStream]);

    const speakPayload = useCallback(async (payload) => {
        speechId.current++;
        const currentId = speechId.current;

        if (!payload?.audio_url) return;

        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        setIsPlaying(false);

        try {
            await startPlaybackFromData(payload, currentId);
        } catch (error) {
            console.error("LipSync payload error:", error);
            if (currentId === speechId.current) cleanup();
        }
    }, [cleanup, startPlaybackFromData]);

    // Animation Loop
    useFrame((state, delta) => {
        if (!isPlaying || !headMeshRef.current) return;

        const hDict = headMeshRef.current.morphTargetDictionary;
        const hInfl = headMeshRef.current.morphTargetInfluences;
        const tDict = teethMeshRef.current?.morphTargetDictionary;
        const tInfl = teethMeshRef.current?.morphTargetInfluences;

        if (!hDict || !hInfl) return;

        if (externalActiveRef.current && externalAnalyserRef.current && externalSamplesRef.current) {
            externalAnalyserRef.current.getByteTimeDomainData(externalSamplesRef.current);

            let sum = 0;
            let peak = 0;
            for (let i = 0; i < externalSamplesRef.current.length; i += 1) {
                const normalized = (externalSamplesRef.current[i] - 128) / 128;
                peak = Math.max(peak, Math.abs(normalized));
                sum += normalized * normalized;
            }

            const rms = Math.sqrt(sum / externalSamplesRef.current.length);
            const floorBlend = rms < externalNoiseFloorRef.current * 1.7 ? 0.04 : 0.004;
            externalNoiseFloorRef.current = MathUtils.lerp(
                externalNoiseFloorRef.current,
                Math.min(rms, 0.035),
                floorBlend
            );

            const gate = Math.max(0.004, externalNoiseFloorRef.current * 1.35);
            const rmsLevel = Math.max(0, (rms - gate) * 38);
            const peakLevel = Math.max(0, (peak - gate * 1.6) * 4.2);
            const targetLevel = Math.min(1, Math.max(rmsLevel, peakLevel));
            const attack = targetLevel > externalLevelRef.current ? 30 : 12;
            const blend = Math.min(Math.max(delta * attack, 0), 1);
            externalLevelRef.current = MathUtils.lerp(externalLevelRef.current, targetLevel, blend);

            const now = performance.now() / 1000;
            if (externalLevelRef.current > 0.08) {
                externalLastSpeechAtRef.current = now;
                if (!externalSpeakingRef.current) {
                    externalSpeakingRef.current = true;
                    if (onStartRef.current) onStartRef.current();
                }
            } else if (externalSpeakingRef.current && now - externalLastSpeechAtRef.current > 0.35) {
                externalSpeakingRef.current = false;
                if (onEndRef.current) onEndRef.current();
            }

            const apply = (key, value) => {
                const headIndex = getMorphIndex(hDict, key);
                if (headIndex !== undefined) {
                    const current = Number(hInfl[headIndex]) || 0;
                    hInfl[headIndex] = clampMorphInfluence(MathUtils.lerp(current, value, blend));
                }

                const teethIndex = getMorphIndex(tDict, key);
                if (tInfl && teethIndex !== undefined) {
                    const currentT = Number(tInfl[teethIndex]) || 0;
                    tInfl[teethIndex] = clampMorphInfluence(MathUtils.lerp(currentT, value, blend));
                }
            };

            ALL_SHAPE_KEYS.forEach((key) => apply(key, 0));

            // --- Spectral (formant-band) analysis: estimate the vowel/consonant
            // shape from the audio spectrum instead of just its loudness. ---
            const level = externalLevelRef.current; // overall mouth openness (0..1)
            const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

            let bright = 0.5; // 0 = rounded/dark vowel (oo/oh), 1 = wide/bright (ee/eh)
            let sib = 0;      // sibilant / fricative presence (s, sh, f, th)
            const freq = externalFreqSamplesRef.current;
            const analyserNode = externalAnalyserRef.current;
            const audioCtx = externalAudioContextRef.current;
            if (freq && analyserNode && audioCtx) {
                analyserNode.getByteFrequencyData(freq);
                const binHz = audioCtx.sampleRate / analyserNode.fftSize;
                let highE = 0;
                let totalE = 0;
                let centroidNum = 0;
                let centroidDen = 0;
                for (let i = 1; i < freq.length; i += 1) {
                    const f = i * binHz;
                    if (f > 8000) break; // ignore hiss above the speech band
                    const mag = freq[i] / 255;
                    const e = mag * mag;
                    totalE += e;
                    centroidNum += f * mag;
                    centroidDen += mag;
                    if (f >= 2000) highE += e;
                }
                if (totalE > 1e-5 && centroidDen > 0) {
                    const centroid = centroidNum / centroidDen;   // spectral centroid (Hz)
                    const highRatio = highE / totalE;             // sibilant indicator
                    bright = clamp01((centroid - 700) / 1800);    // 700Hz→round … 2500Hz→wide
                    sib = clamp01((highRatio - 0.42) / 0.35);
                }
            }

            const vowel = 1 - sib;
            const roundW = vowel * (1 - bright); // oo / oh : pucker + protrude
            const wideW = vowel * bright;        // ee / eh : lips spread
            const open = level;

            // Model-specific shape keys (this avatar's rig)
            apply('TeethTongue_Open', open * (vowel * 0.9 + sib * 0.15));
            apply('Lips_Open_Wide', open * (0.35 + 0.5 * wideW + 0.15 * roundW));
            apply('Lips_Wide', clamp01(open * (0.15 + 0.7 * wideW) + sib * 0.5));
            apply('Lips_Round', open * 0.9 * roundW);
            apply('Lips_Protude', open * 0.5 * roundW);
            apply('Lips_Purse_Narrow', clamp01(sib * 0.4 + roundW * open * 0.2));
            apply('TeethTongue_TipUp', sib * 0.6);
            apply('Lips_Corner_Up', wideW * open * 0.25);
            // Generic ARKit-style fallbacks (for models that use these instead)
            apply('mouthOpen', open * vowel);
            apply('jawOpen', open * vowel * 0.85);
            apply('mouthFunnel', roundW * open * 0.7);
            apply('mouthPucker', clamp01(roundW * open * 0.5 + sib * 0.1));
            return;
        }

        if (!audioRef.current) return;

        // Debug: Log randomly
        if (Math.random() < 0.005) {
            // console.log("LipSync Running...");
        }

        const timeline = timelineRef.current;
        if (timeline.length === 0) return;

        // Calculate sync time with animation running AHEAD of audio by LEAD_IN_TIME
        let syncTime = 0;

        if (audioRef.current && audioRef.current.currentTime > 0) {
            // Audio is playing - animation runs LEAD_IN_TIME ahead of audio
            const audioTime = audioRef.current.currentTime * durationRatio.current;
            const animationTime = audioTime + LEAD_IN_TIME; // Animation is ahead by lead-in time
            const maxTime = timeline[timeline.length - 1].endTime;
            syncTime = Math.max(0, Math.min(animationTime, maxTime));
        } else {
            // Before audio starts - animate from beginning of timeline
            const currentRealTime = performance.now() / 1000;
            const elapsedSinceStart = currentRealTime - animationStartTime.current;

            // Progress through timeline during lead-in period
            const maxTime = timeline[timeline.length - 1].endTime;
            syncTime = Math.max(0, Math.min(elapsedSinceStart, Math.min(LEAD_IN_TIME, maxTime)));
        }

        // Find Current Event: start from last index for speed; if not found, scan from 0 (handles restart/wrong index)
        let event = null;
        let startIdx = currentEventIndex.current;
        for (let i = startIdx; i < timeline.length; i++) {
            const e = timeline[i];
            if (syncTime >= e.startTime && syncTime < e.endTime) {
                event = e;
                currentEventIndex.current = i;
                break;
            }
        }
        if (!event) {
            for (let i = 0; i < startIdx; i++) {
                const e = timeline[i];
                if (syncTime >= e.startTime && syncTime < e.endTime) {
                    event = e;
                    currentEventIndex.current = i;
                    break;
                }
            }
        }
        // Past end of timeline: use last event so mouth doesn't go blank
        if (!event && timeline.length > 0) {
            event = timeline[timeline.length - 1];
            currentEventIndex.current = timeline.length - 1;
        }

        // --- Calculate Target Weights with Early Blending ---
        const targetWeights = {};

        // Quintic smoothstep easing function: 6t⁵ - 15t⁴ + 10t³ (smoother than cubic)
        // This creates very smooth, gradual acceleration and deceleration
        const smoothstep = (t) => t * t * t * (t * (t * 6 - 15) + 10);

        // 1. Current Viseme Weights
        if (event) {
            const shapes = event.shapeKeys;
            for (const key in shapes) {
                targetWeights[key] = shapes[key];
            }
        }

        // 2. Early Blending into Next Phoneme (prevents neutral state between phonemes)
        // Start blending earlier (at 55% instead of 70%) for smoother transitions
        const ANTICIPATION_THRESHOLD = 0.45; // Start blending when 55% through current phoneme

        if (event && currentEventIndex.current < timeline.length - 1) {
            const eventDuration = event.endTime - event.startTime;
            const timeIntoEvent = syncTime - event.startTime;
            const progress = timeIntoEvent / eventDuration;

            // If we're in the last 45% of the current phoneme, start blending to next
            if (progress >= (1 - ANTICIPATION_THRESHOLD)) {
                const nextEvent = timeline[currentEventIndex.current + 1];
                if (nextEvent && nextEvent.shapeKeys) {
                    // Calculate blend factor: 0 at 55% progress, 1 at 100% progress
                    const blendFactor = (progress - (1 - ANTICIPATION_THRESHOLD)) / ANTICIPATION_THRESHOLD;
                    const smoothBlend = smoothstep(blendFactor);

                    // Blend current and next shape keys
                    for (const key in nextEvent.shapeKeys) {
                        const currentValue = targetWeights[key] || 0;
                        const nextValue = nextEvent.shapeKeys[key] || 0;
                        targetWeights[key] = MathUtils.lerp(currentValue, nextValue, smoothBlend);
                    }

                    // Also ensure keys that exist in current but not in next blend to 0
                    for (const key in targetWeights) {
                        if (!(key in nextEvent.shapeKeys)) {
                            const currentValue = targetWeights[key];
                            targetWeights[key] = MathUtils.lerp(currentValue, 0, smoothBlend);
                        }
                    }
                }
            }
        }

        // 3. Apply Blending (Lerp) with reduced speed for smoother frame-to-frame transitions
        // Reduced from 30 to 18 for gentler, more fluid motion
        const rawLerpSpeed = Math.min(Math.max(Number(delta) * 20 || 0, 0), 1);
        const LERP_SPEED = smoothstep(rawLerpSpeed);

        ALL_SHAPE_KEYS.forEach(key => {
            const target = Math.max(0, Math.min(1, targetWeights[key] || 0));

            const headIndex = getMorphIndex(hDict, key);
            if (headIndex !== undefined) {
                const current = Number(hInfl[headIndex]) || 0;
                hInfl[headIndex] = clampMorphInfluence(MathUtils.lerp(current, target, LERP_SPEED));
            }

            const teethIndex = getMorphIndex(tDict, key);
            if (tInfl && teethIndex !== undefined) {
                const currentT = Number(tInfl[teethIndex]) || 0;
                tInfl[teethIndex] = clampMorphInfluence(MathUtils.lerp(currentT, target, LERP_SPEED));
            }
        });

    });

    return {
        speak,
        speakPayload,
        bindExternalAudioStream,
        stopExternalAudioStream,
        stop,
        isPlaying
    };
};
