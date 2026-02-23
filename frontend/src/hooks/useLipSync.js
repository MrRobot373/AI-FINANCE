
import { useState, useRef, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils } from 'three';
import { PHONEME_TO_VISEME, VISEME_TO_SHAPES, ALL_SHAPE_KEYS } from '../utils/lipSyncMappings';
import { PHONEME_TO_SHAPE_KEYS } from '../utils/phonemeShapeKeys';
import { createVisemeTimeline, backendVisemesToTimeline, groupedVisemesToTimeline } from '../utils/lipSyncScheduler';
import { textToAudioVisemesAPI } from '../utils/visemeUtils';
import { clampMorphInfluence } from '../utils/morphUtils';


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
    const timelineRef = useRef([]);
    const durationRatio = useRef(1.0);
    const currentEventIndex = useRef(0);
    const speechId = useRef(0);
    const animationStartTime = useRef(0); // Track when animation started
    const LEAD_IN_TIME = 0.1; // Start animation 1 second before audio (in seconds)

    // Store callbacks in refs
    const onStartRef = useRef(onStart);
    const onEndRef = useRef(onEnd);

    useEffect(() => {
        onStartRef.current = onStart;
    }, [onStart]);

    useEffect(() => {
        onEndRef.current = onEnd;
    }, [onEnd]);

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
            if (hDict && hDict[key] !== undefined) hInfl[hDict[key]] = 0;
            if (tDict && tInfl && tDict[key] !== undefined) {
                tInfl[tDict[key]] = 0;
            }
        });
    }, [headMeshRef, teethMeshRef]);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.onended = null;
            audioRef.current.onplay = null;
            audioRef.current = null;
        }
        setIsPlaying(false);
        resetMorphTargets();

        if (onEndRef.current) onEndRef.current();
    }, [resetMorphTargets]);

    /** Max characters per TTS request to avoid 200+ events and playback failures with long text */
    const MAX_SPEECH_CHARS = 1200;

    /**
     * Start speaking
     * @param {string} text - Text to speak
     */
    const speak = useCallback(async (text) => {
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
            const data = await textToAudioVisemesAPI(speechText);

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
        cleanup();
    }, [cleanup]);

    // Animation Loop
    useFrame((state, delta) => {
        if (!isPlaying || !audioRef.current || !headMeshRef.current) return;

        const hDict = headMeshRef.current.morphTargetDictionary;
        const hInfl = headMeshRef.current.morphTargetInfluences;
        const tDict = teethMeshRef.current?.morphTargetDictionary;
        const tInfl = teethMeshRef.current?.morphTargetInfluences;

        if (!hDict || !hInfl) return;

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

            if (hDict[key] !== undefined) {
                const current = Number(hInfl[hDict[key]]) || 0;
                hInfl[hDict[key]] = clampMorphInfluence(MathUtils.lerp(current, target, LERP_SPEED));
            }
            if (tDict && tInfl && tDict[key] !== undefined) {
                const currentT = Number(tInfl[tDict[key]]) || 0;
                tInfl[tDict[key]] = clampMorphInfluence(MathUtils.lerp(currentT, target, LERP_SPEED));
            }
        });

    });

    return {
        speak,
        stop,
        isPlaying
    };
};
