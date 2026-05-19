import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, User, Sparkles, Mic, Volume2, RefreshCcw, MicOff, VolumeOff, MessageSquare, Speech, Radio } from 'lucide-react';
import FloatingNav from '../components/FloatingNav';
import { useChatStore } from '../store/useChatStore';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber'
// import ChatInterface from '../components/Chat/ChatInterface';
import Avatar from '../components/Avatar';
import { OrbitControls } from '@react-three/drei';
import VenomBlob from '../components/VenomBlob';
import MessageContent, { LoadingDots } from '../utils/messageFormatting.jsx';
import { cleanMessageText } from '../utils/messageText.js';
import { apiUrl } from '../utils/apiBase';
import { useRealtimeVoice } from '../hooks/useRealtimeVoice';
import { useFastRtcVoice } from '../hooks/useFastRtcVoice';

const Typewriter = ({ text, onComplete }) => {
    const [displayText, setDisplayText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);


    useEffect(() => {
        if (!text) return;

        if (currentIndex < text.length) {
            const timeout = setTimeout(() => {
                setDisplayText(prev => prev + text[currentIndex]);
                setCurrentIndex(prev => prev + 1);
            }, 30); // Adjust speed here
            return () => clearTimeout(timeout);
        } else {
            if (onComplete) onComplete();
        }
    }, [currentIndex, text, onComplete]);

    return <p className="whitespace-pre-wrap leading-relaxed text-[15px]">{displayText}</p>;
};

const sanitizeSpeechText = (value = '') => {
    return String(value)
        .replace(/```[\s\S]*?```/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}]/gu, '')
        .replace(/^\s*[\*\-\u2022]\s+/gm, '')
        .replace(/[\*#_`~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const takeSpeakableSegments = (fullText, consumedLength, force = false) => {
    const pending = fullText.slice(consumedLength);
    if (!pending.trim()) return { segments: [], consumed: 0 };

    const maxSegmentLength = 260;
    const segments = [];
    let consumed = 0;
    const sentenceRegex = /[.!?](?=\s|$)/g;
    let match;

    while ((match = sentenceRegex.exec(pending)) !== null) {
        let end = match.index + 1;
        while (pending[end] === ' ') end += 1;

        const sentence = pending.slice(consumed, end).trim();
        if (sentence) {
            segments.push(sentence);
        }
        consumed = end;
    }

    if (force && consumed < pending.length) {
        const rest = pending.slice(consumed).trim();
        if (rest) {
            segments.push(rest);
            consumed = pending.length;
        }
    }

    const normalizedSegments = [];
    for (const segment of segments) {
        if (segment.length <= maxSegmentLength) {
            normalizedSegments.push(segment);
            continue;
        }

        let remaining = segment;
        while (remaining.length > maxSegmentLength) {
            const splitAt = Math.max(
                remaining.lastIndexOf(',', maxSegmentLength),
                remaining.lastIndexOf(';', maxSegmentLength),
                remaining.lastIndexOf(' ', maxSegmentLength)
            );
            const index = splitAt > 60 ? splitAt : maxSegmentLength;
            normalizedSegments.push(remaining.slice(0, index).trim());
            remaining = remaining.slice(index).trim();
        }
        if (remaining) normalizedSegments.push(remaining);
    }

    return { segments: normalizedSegments, consumed };
};

const AvatarPage = () => {
    const {
        messages = [],
        isLoading,
        sendMessage,
        currentSessionId,
        setSection,
        addMessage,
        startAssistantMessage,
        appendAssistantDelta
    } = useChatStore();
    const [input, setInput] = useState('');
    const [speechText, setSpeechText] = useState(''); // Separate state for speech/lip sync
    const [ischatting, setIschatting] = useState(false)
    const emotions = ["happy", "sad", "explain1", "explain2", "listen", "Think", "natural"]
    const [currentEmotion, setCurrentEmotion] = useState("natural")

    useEffect(() => {
        setSection('avatar');
    }, [setSection]);
    const messagesEndRef = useRef(null);
    const [ismale, setIsmale] = useState(true)
    const [issoundon, setIssoundon] = useState(true)
    const [ismicon, setIsmicon] = useState(true)
    const [reloadKey, setReloadKey] = useState(0)
    const [text, setText] = useState("")
    const [speechPayload, setSpeechPayload] = useState(null)
    const [speechPayloadTrigger, setSpeechPayloadTrigger] = useState(0)
    const [stopSpeechTrigger, setStopSpeechTrigger] = useState(0)
    const [callavatar, setCallavatar] = useState(false)
    const [speakTrigger, setSpeakTrigger] = useState(0)
    const [showLatestMessage, setShowLatestMessage] = useState(false); // Controls visibility of last msg
    const nav = useNavigate()

    // --- Voice Recording State ---
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingStreamRef = useRef(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [voiceModeActive, setVoiceModeActive] = useState(false);
    const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const vadFrameRef = useRef(null);
    const speechDetectedRef = useRef(false);
    const silenceStartedAtRef = useRef(null);
    const recordingStartedAtRef = useRef(0);
    const discardRecordingRef = useRef(false);
    const speechQueueRef = useRef([]);
    const speechPayloadQueueRef = useRef([]);
    const speechBusyRef = useRef(false);
    const spokenCleanLengthRef = useRef(0);
    const activeAssistantIndexRef = useRef(-1);
    const isLoadingRef = useRef(false);
    const soundOnRef = useRef(true);
    const voiceModeActiveRef = useRef(false);
    const fastRtcAudioRef = useRef(null);

    useEffect(() => {
        isLoadingRef.current = isLoading;
    }, [isLoading]);

    useEffect(() => {
        soundOnRef.current = issoundon;
    }, [issoundon]);

    useEffect(() => {
        voiceModeActiveRef.current = voiceModeActive;
    }, [voiceModeActive]);

    const playNextSpeechPayload = () => {
        if (!soundOnRef.current) return;

        const nextPayload = speechPayloadQueueRef.current.shift();
        if (!nextPayload) {
            speechBusyRef.current = false;
            return;
        }

        speechBusyRef.current = true;
        setSpeechPayload(nextPayload);
        setShowLatestMessage(true);
        setSpeechPayloadTrigger(prev => prev + 1);
    };

    const stopCurrentAvatarSpeech = () => {
        speechQueueRef.current = [];
        speechPayloadQueueRef.current = [];
        speechBusyRef.current = false;
        setText('');
        setSpeechPayload(null);
        setIsAvatarSpeaking(false);
        setShowLatestMessage(true);
        setCurrentEmotion("listen");
        setStopSpeechTrigger(prev => prev + 1);
    };

    const realtimeVoice = useRealtimeVoice({
        gender: ismale ? 'male' : 'female',
        isAssistantSpeaking: isAvatarSpeaking || speechBusyRef.current,
        onFinalTranscript: (transcript) => {
            if (!transcript?.trim()) return;
            setInput('');
            setIschatting(true);
            addMessage({ role: 'user', content: transcript, created_at: new Date().toISOString() });
        },
        onAssistantStart: () => {
            setIschatting(true);
            setShowLatestMessage(false);
            startAssistantMessage();
        },
        onAssistantDelta: (delta) => {
            appendAssistantDelta(delta);
        },
        onSpeechChunk: (chunk) => {
            speechPayloadQueueRef.current.push(chunk);
            if (!speechBusyRef.current && soundOnRef.current) {
                playNextSpeechPayload();
            }
        },
        onAssistantDone: () => {
            setShowLatestMessage(true);
        },
        onBargeIn: stopCurrentAvatarSpeech,
        onError: (message) => {
            console.error('Realtime voice error:', message);
            setInput('');
        },
    });
    const fastRtcVoice = useFastRtcVoice();

    useEffect(() => {
        const audio = fastRtcAudioRef.current;
        if (!audio) return;

        audio.muted = !issoundon;
        audio.volume = issoundon ? 1 : 0;

        if (fastRtcVoice.remoteStream) {
            audio.srcObject = fastRtcVoice.remoteStream;
            audio.play().catch((err) => {
                console.error('FastRTC audio playback failed:', err);
            });
        } else {
            audio.pause();
            audio.srcObject = null;
        }
    }, [fastRtcVoice.remoteStream, issoundon]);

    useEffect(() => {
        if (!realtimeVoice.active) return;

        const labels = {
            connected: 'Connected...',
            listening: 'Listening...',
            speech_detected: 'Listening...',
            transcribing: 'Transcribing...',
            thinking: 'Thinking...',
            synthesizing: 'Preparing voice...',
            idle: '',
            disconnected: '',
        };
        setInput(labels[realtimeVoice.status] ?? '');
    }, [realtimeVoice.active, realtimeVoice.status]);

    useEffect(() => {
        if (!fastRtcVoice.active) return;

        const labels = {
            connecting: 'Connecting realtime voice...',
            connected: 'Connected...',
            listening: 'Listening...',
            speaking: 'Speaking...',
            unavailable: '',
            disconnected: '',
            failed: '',
            closed: '',
            idle: '',
        };
        setInput(labels[fastRtcVoice.status] ?? '');
    }, [fastRtcVoice.active, fastRtcVoice.status]);

    useEffect(() => {
        if (!realtimeVoice.active) return;
        if (realtimeVoice.recording || isAvatarSpeaking || speechBusyRef.current || isLoading) return;
        if (['transcribing', 'thinking', 'synthesizing', 'speech_detected'].includes(realtimeVoice.status)) return;

        const timer = setTimeout(() => {
            if (!speechBusyRef.current) {
                realtimeVoice.startRecording();
            }
        }, 450);

        return () => clearTimeout(timer);
    }, [realtimeVoice, realtimeVoice.active, realtimeVoice.recording, realtimeVoice.status, isAvatarSpeaking, isLoading]);

    const getSupportedAudioMimeType = () => {
        if (!window.MediaRecorder) return '';
        const candidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
        ];
        return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
    };

    const cleanupRecordingStream = () => {
        if (vadFrameRef.current) {
            cancelAnimationFrame(vadFrameRef.current);
            vadFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { });
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
    };

    const startVadMonitor = (stream) => {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        speechDetectedRef.current = false;
        silenceStartedAtRef.current = null;
        recordingStartedAtRef.current = performance.now();

        const samples = new Uint8Array(analyser.fftSize);
        const speechThreshold = 0.028;
        const silenceMs = 850;
        const minRecordingMs = 500;
        const maxRecordingMs = 15000;

        const tick = () => {
            if (mediaRecorderRef.current?.state !== 'recording') return;

            analyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (let i = 0; i < samples.length; i++) {
                const normalized = (samples[i] - 128) / 128;
                sum += normalized * normalized;
            }

            const rms = Math.sqrt(sum / samples.length);
            const now = performance.now();
            const elapsed = now - recordingStartedAtRef.current;

            if (rms > speechThreshold) {
                speechDetectedRef.current = true;
                silenceStartedAtRef.current = null;
                setInput('Listening...');
            } else if (speechDetectedRef.current) {
                if (!silenceStartedAtRef.current) {
                    silenceStartedAtRef.current = now;
                }

                if (elapsed > minRecordingMs && now - silenceStartedAtRef.current > silenceMs) {
                    stopRecording();
                    return;
                }
            }

            if (elapsed > maxRecordingMs) {
                stopRecording();
                return;
            }

            vadFrameRef.current = requestAnimationFrame(tick);
        };

        vadFrameRef.current = requestAnimationFrame(tick);
    };

    const sendRecordedAudio = async (blob) => {
        setIsTranscribing(true);
        setInput('Transcribing...');

        try {
            const token = import.meta.env.VITE_API_TOKEN || localStorage.getItem('token');
            const formData = new FormData();
            const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
            formData.append('audio', blob, `voice-input.${extension}`);

            const response = await fetch(apiUrl('/ai/voice'), {
                method: 'POST',
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: formData,
            });

            if (!response.ok) throw new Error(`Server returned ${response.status}`);

            const data = await response.json();

            if (data.text) {
                setInput('');
                setIschatting(true);
                sendMessage(data.text);
            } else {
                console.log('No speech transcribed:', data.message);
                setInput('');
                setVoiceModeActive(false);
            }
        } catch (err) {
            console.error('Error transcribing voice:', err);
            setInput('');
            setVoiceModeActive(false);
        } finally {
            setIsTranscribing(false);
        }
    };

    const stopRecording = (discard = false) => {
        discardRecordingRef.current = discard;
        if (mediaRecorderRef.current?.state === 'recording') {
            setInput(discard ? '' : 'Transcribing...');
            mediaRecorderRef.current.stop();
        }
    };

    const startRecording = async () => {
        if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            console.error('Browser voice recording is not supported.');
            setInput('');
            return;
        }

        if (isLoadingRef.current || speechBusyRef.current || isAvatarSpeaking) {
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            recordingStreamRef.current = stream;
            audioChunksRef.current = [];
            discardRecordingRef.current = false;

            const mimeType = getSupportedAudioMimeType();
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

            recorder.ondataavailable = (event) => {
                if (event.data?.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
                const shouldDiscard = discardRecordingRef.current;
                const heardSpeech = speechDetectedRef.current;
                cleanupRecordingStream();
                mediaRecorderRef.current = null;
                setIsRecording(false);

                if (shouldDiscard) {
                    setInput('');
                    return;
                }

                if (!heardSpeech || blob.size < 100) {
                    setInput('');
                    setVoiceModeActive(false);
                    return;
                }

                await sendRecordedAudio(blob);
            };

            mediaRecorderRef.current = recorder;
            recorder.start(250);
            startVadMonitor(stream);
            setIsRecording(true);
            setInput('Listening...');
        } catch (err) {
            cleanupRecordingStream();
            setIsRecording(false);
            setInput('');
            console.error('Could not start voice recording:', err);
        }
    };

    const handleMicToggle = async () => {
        if (realtimeVoice.active) {
            realtimeVoice.stop();
            stopCurrentAvatarSpeech();
            return;
        }

        if (fastRtcVoice.active) {
            fastRtcVoice.stop();
        }

        await realtimeVoice.start();
    };

    const handleFastRtcToggle = async () => {
        if (fastRtcVoice.active) {
            fastRtcVoice.stop();
            stopCurrentAvatarSpeech();
            return;
        }

        if (realtimeVoice.active) {
            realtimeVoice.stop();
        }

        stopCurrentAvatarSpeech();
        setIschatting(true);
        await fastRtcVoice.start();
    };

    useEffect(() => {
        if (!voiceModeActive) return;
        if (isRecording || isTranscribing || isLoading || isAvatarSpeaking || speechBusyRef.current) return;

        const timer = setTimeout(() => {
            if (voiceModeActiveRef.current) {
                startRecording();
            }
        }, 450);

        return () => clearTimeout(timer);
    }, [voiceModeActive, isRecording, isTranscribing, isLoading, isAvatarSpeaking]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Set ischatting based on whether messages exist
    useEffect(() => {
        if (messages && messages.length > 0) {
            setIschatting(true);
        } else {
            setIschatting(false);
        }
    }, [messages]);

    // Debug: Monitor isLoading state
    // Auto-speak when AI finishes responding
    const prevIsLoading = useRef(isLoading);

    useEffect(() => {
        // Check if loading just finished (went from true to false)
        if (false && prevIsLoading.current && !isLoading) {
            console.log("🤖 AvatarPage: AI response finished (isLoading: true -> false)");

            // Get the last message
            if (messages.length > 0) {
                const lastMsg = messages[messages.length - 1];
                console.log("📩 Last message role:", lastMsg.role);

                // Only speak if it's the assistant's message and we haven't spoken it yet
                if (lastMsg.role === 'assistant') {
                    // Clean text for speech: remove code blocks, emojis, bullets, markdown, and extra spaces
                    let cleanText = lastMsg.content.replace(/```json[\s\S]*?```/g, ''); // Remove JSON blocks

                    // Remove Emojis (Range covering most common emojis)
                    cleanText = cleanText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}-\u{2454}]/gu, '');

                    // Remove Bullet Points and list markers (*, -, •, 1.)
                    cleanText = cleanText.replace(/^\s*[\*\-•]\s+/gm, ''); // Remove bullet at start of line
                    cleanText = cleanText.replace(/[\*\-•]/g, ''); // Remove inline bullets

                    // Remove Markdown formatting (*bold*, _italic_, # headers)
                    cleanText = cleanText.replace(/[\*#_`~]/g, ''); // Remove markdown chars

                    // Remove Extra Spaces and Newlines
                    cleanText = cleanText.replace(/\s+/g, ' ').trim();
                    console.log("🗣️ Triggering speech for:", cleanText.substring(0, 50) + "...");

                    if (cleanText) {
                        if (issoundon) {
                            setText(cleanText);
                            setShowLatestMessage(false); // Hide message initially

                            // Use timeout to ensure state updates before triggering
                            setTimeout(() => {
                                setSpeakTrigger(prev => prev + 1);
                                console.log("🚀 Speak trigger incremented");
                            }, 50);
                        } else {
                            setText('');
                            setShowLatestMessage(true);
                        }
                    }
                }
            }
        }
        prevIsLoading.current = isLoading;
    }, [isLoading, messages, issoundon]);

    const playNextSpeechSegment = () => {
        if (!soundOnRef.current) return;

        const nextSegment = speechQueueRef.current.shift();
        if (!nextSegment) {
            speechBusyRef.current = false;
            if (!isLoadingRef.current) {
                setShowLatestMessage(true);
            }
            return;
        }

        speechBusyRef.current = true;
        setText(nextSegment);
        setShowLatestMessage(true);
        setTimeout(() => setSpeakTrigger(prev => prev + 1), 20);
    };

    useEffect(() => {
        const lastIndex = messages.length - 1;
        const lastMsg = messages[lastIndex];

        if (!lastMsg || lastMsg.role !== 'assistant') return;

        if (activeAssistantIndexRef.current !== lastIndex) {
            activeAssistantIndexRef.current = lastIndex;
            spokenCleanLengthRef.current = 0;
            speechQueueRef.current = [];
            speechBusyRef.current = false;
            setShowLatestMessage(false);
        }

        if (!issoundon) {
            setShowLatestMessage(true);
            return;
        }

        const cleanText = sanitizeSpeechText(lastMsg.content);
        if (!cleanText) return;

        const { segments, consumed } = takeSpeakableSegments(
            cleanText,
            spokenCleanLengthRef.current,
            !isLoading
        );

        if (segments.length > 0) {
            speechQueueRef.current.push(...segments);
            spokenCleanLengthRef.current += consumed;
            if (!speechBusyRef.current) {
                playNextSpeechSegment();
            }
        } else if (!isLoading && !speechBusyRef.current) {
            setShowLatestMessage(true);
        }
    }, [messages, isLoading, issoundon]);

    useEffect(() => {
        if (realtimeVoice.recording || (fastRtcVoice.active && ['listening', 'connecting', 'connected'].includes(fastRtcVoice.status))) {
            setCurrentEmotion("listen");
        } else if (isAvatarSpeaking) {
            return;
        } else if (isLoading || ['transcribing', 'thinking', 'synthesizing'].includes(realtimeVoice.status)) {
            setCurrentEmotion("think");
        }
    }, [realtimeVoice.recording, realtimeVoice.status, fastRtcVoice.active, fastRtcVoice.status, isLoading, isAvatarSpeaking]);

    const handleSpeechStart = () => {
        speechBusyRef.current = true;
        setIsAvatarSpeaking(true);
        setShowLatestMessage(true); // Show message when speech starts
        setCurrentEmotion(Math.random() > 0.5 ? "explain1" : "explain2");
    };

    const handleSpeechEnd = () => {
        speechBusyRef.current = false;
        setIsAvatarSpeaking(false);
        setCurrentEmotion("natural");
        setTimeout(() => {
            if (speechPayloadQueueRef.current.length > 0 && soundOnRef.current) {
                playNextSpeechPayload();
            } else if (speechQueueRef.current.length > 0 && soundOnRef.current) {
                playNextSpeechSegment();
            }
        }, 80);
    };



    const handleSubmit = (e) => {
        e.preventDefault();
        setIschatting(true)
        if (!input.trim() || isLoading) return;
        sendMessage(input);
        setInput('');
    };

    const handleSpeaking = () => {
        if (!speechText.trim()) return;
        if (!issoundon) return;
        setCallavatar(true)
        setIschatting(true)
        setText(speechText)
        // Trigger viseme playback by incrementing counter
        setSpeakTrigger(prev => prev + 1)
    }

    const handleSoundToggle = () => {
        setIssoundon((current) => {
            const next = !current;
            if (!next) {
                speechQueueRef.current = [];
                speechPayloadQueueRef.current = [];
                speechBusyRef.current = false;
                setText('');
                setSpeechPayload(null);
                setIsAvatarSpeaking(false);
                setStopSpeechTrigger(prev => prev + 1);
                setShowLatestMessage(true);
            }
            return next;
        });
    };

    const hasPendingAssistant = isLoading
        && messages[messages.length - 1]?.role === 'assistant'
        && !messages[messages.length - 1]?.content?.trim();
    const fastRtcMissing = fastRtcVoice.health?.missing_dependencies?.join(', ');
    const fastRtcTitle = fastRtcVoice.ready
        ? (fastRtcVoice.active ? 'Stop FastRTC speech-to-speech mode' : 'Start FastRTC speech-to-speech mode')
        : (fastRtcMissing ? `Install FastRTC voice dependencies: ${fastRtcMissing}` : 'FastRTC voice backend is not enabled');

    return (
        <div className="min-h-screen bg-[#030303] flex gap-2 relative overflow-hidden">
            {/* Top Navigation */}
            <FloatingNav />

            <div className='absolute text-white top-5 left-5'>
                <span className='text-[#33A8A1] text-3xl'>Fin</span><span className='text-3xl'>Wise</span>
                <br />
                <span className='text-xl'>
                    Avatar
                </span>
            </div>

            <div className="absolute inset-0 pointer-events-none">
                {/* Left green glow */}
                <div className="absolute top-[5%] left-[2%] w-[320px] h-[320px] 
    bg-emerald-400/25 rounded-full blur-[150px] " />
                <div className="absolute top-[65%] left-[15%] w-[450px] h-[300px] 
    bg-emerald-400/30 rounded-full blur-[150px]" />
                <div className="absolute top-[55%] right-[30%] w-[450px] h-[300px] 
    bg-blue-400/30 rounded-full blur-[150px]" />
                {/* Center lime glow */}
                <div className="absolute bottom-[10%] right-[5%] w-[300px] h-[300px] 
    bg-emerald-400/30 rounded-full blur-[90px]" />
            </div>

            {/* Avatar Space */}
            <div className='w-[800px] flex justify-center h-[calc(100vh-6.1rem)] mt-[calc(100vh-88vh)] bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl relative overflow-hidden'>
                <button onClick={() => {
                    setIsmale(!ismale)
                    setReloadKey(k => k + 1)
                }} className='absolute top-4 right-4 bg-emerald-500 rounded-full p-2  z-10'>
                    <RefreshCcw size={20} />
                </button>
                <Canvas
                    camera={{ position: [0, 1, 3], fov: 50 }}>
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[2, 2, 5]} intensity={2} />
                    <Avatar
                        model={ismale ? '/models/maleEyeShapeKeys.glb' : '/models/Female7.glb'}
                        handpos={ismale ? 1.3 : 1.15}
                        ischatting={ischatting}
                        ismale={ismale}
                        text={text ? text : ""}
                        speakTrigger={speakTrigger}
                        speechPayload={speechPayload}
                        speechPayloadTrigger={speechPayloadTrigger}
                        stopSpeechTrigger={stopSpeechTrigger}
                        externalAudioStream={fastRtcVoice.remoteStream}
                        onSpeechStart={handleSpeechStart}
                        onSpeechEnd={handleSpeechEnd}
                        emotions={currentEmotion}
                        soundEnabled={issoundon}
                    />
                    {/* Use this to rotate the model using mouse pointer */}
                    <OrbitControls />
                </Canvas>
                <audio ref={fastRtcAudioRef} autoPlay playsInline className="hidden" />

                {/* Speech Input Section - Independent from Chat */}
                {/* <div className='absolute flex flex-col items-center w-full gap-3 z-10 bottom-20 px-4'>
                    <div className='w-full max-w-md bg-black/40 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-3 shadow-xl'>
                        <div className='flex items-center gap-2'>
                            <select
                                value={currentEmotion}
                                onChange={(e) => setCurrentEmotion(e.target.value)}
                                className="bg-black/50 text-white border border-emerald-500/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                            >
                                {emotions.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={speechText}
                                onChange={(e) => {
                                    setSpeechText(e.target.value);
                                }}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' && speechText.trim()) {
                                        handleSpeaking();
                                    }
                                }}
                                placeholder="Type text for avatar to speak..."
                                className="flex-1 bg-transparent border-none text-white placeholder-gray-400 py-2 px-3 focus:outline-none text-sm"
                            />
                            <button
                                onClick={handleSpeaking}
                                disabled={!speechText.trim()}
                                className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center ${speechText.trim()
                                    ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:scale-105'
                                    : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/10'
                                    }`}
                            >
                                <Speech size={18} />
                            </button>
                        </div>
                    </div>
                </div> */}

                <div className='absolute flex justify-center w-full gap-10 z-10 bottom-4 border-t pt-4 border-white/10'>
                    <div
                        className={`rounded-full w-fit p-3 cursor-pointer transition-all duration-300 ${realtimeVoice.recording ? 'bg-red-500 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]' : realtimeVoice.active ? 'bg-emerald-500 ring-2 ring-emerald-300/60' : 'bg-emerald-500'}`}
                        onClick={handleMicToggle}
                        title={realtimeVoice.active ? "Stop realtime voice mode" : "Start realtime voice mode"}
                    >
                        {['transcribing', 'thinking', 'synthesizing'].includes(realtimeVoice.status)
                            ? <Loader2 size={20} className="text-white animate-spin" />
                            : (realtimeVoice.active ? <MicOff size={20} className="text-white" /> : <Mic size={20} className="text-white" />)}
                    </div>
                    <button
                        type="button"
                        disabled={!fastRtcVoice.ready && !fastRtcVoice.active}
                        className={`rounded-full w-fit p-3 transition-all duration-300 ${fastRtcVoice.active
                            ? 'bg-blue-500 ring-2 ring-blue-300/60'
                            : fastRtcVoice.ready
                                ? 'bg-cyan-500 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)]'
                                : 'bg-white/10 border border-white/10 text-gray-500 cursor-not-allowed'
                        }`}
                        onClick={handleFastRtcToggle}
                        title={fastRtcTitle}
                        aria-label={fastRtcTitle}
                    >
                        {fastRtcVoice.status === 'connecting'
                            ? <Loader2 size={20} className="text-white animate-spin" />
                            : <Radio size={20} className={fastRtcVoice.ready || fastRtcVoice.active ? 'text-white' : 'text-gray-500'} />}
                    </button>
                    <div
                        className={`${issoundon ? 'bg-emerald-500' : 'bg-white/10 border border-white/10'} rounded-full p-3 cursor-pointer transition-all`}
                        onClick={handleSoundToggle}
                        title={issoundon ? 'Mute speaker' : 'Unmute speaker'}
                    >

                        {!issoundon ? <VolumeOff size={20} /> : <Volume2 size={20} />}
                    </div>
                    {/* 
                    Chat Button
                    remove this button after integrating the voice feature this was added just to test the zoom effect 
                    */}
                    {/* <div className='bg-emerald-500 rounded-full p-3'
                        onClick={() => setIschatting(!ischatting)}>
                        <MessageSquare size={20} />
                    </div> */}
                </div>
            </div>
            {/* Chat Component*/}
            <div className="flex-1 flex items-center justify-end pt-[calc(100vh-88vh)] relative">
                <div className="w-[800px] h-[calc(100vh-6.1rem)] bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl flex flex-col relative overflow-hidden">
                    {/* Subtle inner glow */}
                    <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent pointer-events-none"></div>
                    {/* Conditional Layout based on chatting state */}
                    {!ischatting ? (
                        /* Initial State - Centered Input */
                        <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
                            {/* Animated Venom Blob */}
                            <div className="relative w-30 h-30">
                                <VenomBlob className="w-full h-full" />
                            </div>

                            <h2 className="text-3xl font-bold mb-3 text-white">
                                Good Morning! How can I assist you?
                            </h2>
                            <p className="text-sm text-gray-400 font-light max-w-md mb-12">
                                Start your request, and let FinWise handle everything
                            </p>
                            {/* Centered Input Form */}
                            <div className="w-full max-w-2xl">
                                <form onSubmit={handleSubmit} className='w-full'>
                                    <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-xl flex items-center gap-3">
                                        <div className="flex-1 px-4">
                                            <input
                                                type="text"
                                                value={input}
                                                onChange={(e) => {
                                                    setInput(e.target.value)
                                                    setText(e.target.value)
                                                }}
                                                placeholder="Start your request, and let FinWise handle everything"
                                                className="w-full bg-transparent border-none text-white placeholder-gray-500 py-3 focus:outline-none text-sm"
                                                disabled={isLoading || realtimeVoice.active || fastRtcVoice.active}
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={!input.trim() || isLoading || realtimeVoice.active || fastRtcVoice.active}
                                            className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center ${input.trim() && !isLoading && !realtimeVoice.active && !fastRtcVoice.active
                                                ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:scale-105'
                                                : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/10'
                                                }`}
                                        >
                                            {isLoading ? (
                                                <>
                                                    <Loader2 className="animate-spin" size={16} />
                                                </>
                                            ) : (
                                                <>
                                                    <Send size={16} />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    ) : (
                        /* Chatting State - Messages + Bottom Input */
                        <>
                            {/* Messages Area */}
                            <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide relative z-10">
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                                        {msg.role === 'assistant' && (
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500/20 to-green-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-1 shadow-lg backdrop-blur-sm">
                                                <Bot size={18} className="text-emerald-400" />
                                            </div>
                                        )}

                                        <div className={`max-w-[70%] rounded-2xl px-5 py-3.5 shadow-lg ${msg.role === 'user'
                                            ? 'bg-emerald-500/10 text-white border border-emerald-500/20 backdrop-blur-md'
                                            : 'bg-white/5 text-gray-200 border border-white/10 backdrop-blur-md'
                                            }`}>
                                            {msg.role === 'assistant' && idx === messages.length - 1 ? (
                                                showLatestMessage ? (
                                                    <Typewriter text={cleanMessageText(msg.content)} />
                                                ) : (
                                                    <div className="flex items-center gap-1 h-6">
                                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                                                    </div>
                                                )
                                            ) : (
                                                <MessageContent content={msg.content} className="text-[15px]" />
                                            )}
                                        </div>

                                        {msg.role === 'user' && (
                                            <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-1 shadow-lg backdrop-blur-sm">
                                                <User size={18} className="text-gray-300" />
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {isLoading && !hasPendingAssistant && (
                                    <div className="flex gap-4 justify-start">
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500/20 to-green-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-1 backdrop-blur-sm">
                                            <Bot size={18} className="text-emerald-400" />
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md px-5 py-4 flex items-center gap-2">
                                            <LoadingDots />
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>




                            {/* Input Area - Bottom Position */}
                            <div className="p-6 border-t border-white/5 relative z-10">
                                <form onSubmit={handleSubmit} className='w-full'>
                                    <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 shadow-xl flex items-center gap-3">
                                        <div className="flex-1 px-4">
                                            <input
                                                type="text"
                                                value={input}
                                                onChange={(e) => {
                                                    setInput(e.target.value)
                                                }}
                                                placeholder="Start your request, and let FinWise handle everything"
                                                className="w-full bg-transparent border-none text-white placeholder-gray-500 py-3 focus:outline-none text-sm"
                                                disabled={isLoading || realtimeVoice.active || fastRtcVoice.active}
                                            />
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-2 pr-2">
                                            <button
                                                type="submit"
                                                disabled={!input.trim() || isLoading || realtimeVoice.active || fastRtcVoice.active}
                                                className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center ${input.trim() && !isLoading && !realtimeVoice.active && !fastRtcVoice.active
                                                    ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:scale-105'
                                                    : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/10'
                                                    }`}
                                            >
                                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AvatarPage;
