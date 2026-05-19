import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, User, Mic, Volume2, RefreshCcw, MicOff, VolumeOff } from 'lucide-react';
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
        setSection
    } = useChatStore();
    const [input, setInput] = useState('');
    const [ischatting, setIschatting] = useState(false)
    const emotions = ["happy", "sad", "explain1", "explain2", "listen", "Think", "natural"]
    const [currentEmotion, setCurrentEmotion] = useState("natural")

    useEffect(() => {
        setSection('avatar');
    }, [setSection]);
    const messagesEndRef = useRef(null);
    const [ismale, setIsmale] = useState(true)
    const [issoundon, setIssoundon] = useState(true)
    const [reloadKey, setReloadKey] = useState(0)
    const [text, setText] = useState("")
    const [stopSpeechTrigger, setStopSpeechTrigger] = useState(0)
    const [speakTrigger, setSpeakTrigger] = useState(0)
    const [showLatestMessage, setShowLatestMessage] = useState(false); // Controls visibility of last msg
    const nav = useNavigate()

    const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
    const speechQueueRef = useRef([]);
    const speechBusyRef = useRef(false);
    const spokenCleanLengthRef = useRef(0);
    const activeAssistantIndexRef = useRef(-1);
    const isLoadingRef = useRef(false);
    const soundOnRef = useRef(true);
    const fastRtcAudioRef = useRef(null);
    const voiceToggleInFlightRef = useRef(false);
    const suppressVoiceClickRef = useRef(false);

    useEffect(() => {
        isLoadingRef.current = isLoading;
    }, [isLoading]);

    useEffect(() => {
        soundOnRef.current = issoundon;
    }, [issoundon]);

    const stopCurrentAvatarSpeech = () => {
        speechQueueRef.current = [];
        speechBusyRef.current = false;
        setText('');
        setIsAvatarSpeaking(false);
        setShowLatestMessage(true);
        setCurrentEmotion("listen");
        setStopSpeechTrigger(prev => prev + 1);
    };

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
        if (!fastRtcVoice.active) return;

        const labels = {
            requesting_microphone: 'Allow microphone access...',
            connecting: 'Connecting realtime voice...',
            connected: 'Realtime voice active...',
            listening: 'Listening...',
            speaking: 'Realtime voice active...',
            unavailable: '',
            disconnected: '',
            failed: '',
            closed: '',
            idle: '',
        };
        setInput(labels[fastRtcVoice.status] ?? '');
    }, [fastRtcVoice.active, fastRtcVoice.status]);

    const handleVoiceToggle = async () => {
        if (voiceToggleInFlightRef.current) return;
        voiceToggleInFlightRef.current = true;

        try {
            if (fastRtcVoice.active) {
                fastRtcVoice.stop();
                stopCurrentAvatarSpeech();
                return;
            }

            stopCurrentAvatarSpeech();
            setIschatting(true);
            await fastRtcVoice.start();
        } finally {
            voiceToggleInFlightRef.current = false;
        }
    };

    const handleVoicePointerDown = (event) => {
        event.preventDefault();
        suppressVoiceClickRef.current = true;
        handleVoiceToggle();
    };

    const handleVoiceClick = () => {
        if (suppressVoiceClickRef.current) {
            suppressVoiceClickRef.current = false;
            return;
        }
        handleVoiceToggle();
    };

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
        if (fastRtcVoice.active && ['listening', 'connecting', 'connected', 'speaking'].includes(fastRtcVoice.status)) {
            setCurrentEmotion("listen");
        } else if (isAvatarSpeaking) {
            return;
        } else if (isLoading) {
            setCurrentEmotion("think");
        }
    }, [fastRtcVoice.active, fastRtcVoice.status, isLoading, isAvatarSpeaking]);

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
            if (speechQueueRef.current.length > 0 && soundOnRef.current) {
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

    const handleSoundToggle = () => {
        setIssoundon((current) => {
            const next = !current;
            if (!next) {
                speechQueueRef.current = [];
                speechBusyRef.current = false;
                setText('');
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
    const fastRtcStatusText = fastRtcVoice.error || {
        requesting_microphone: 'Allow microphone access',
        connecting: 'Connecting voice',
        connected: 'Voice active',
        listening: 'Listening',
        speaking: 'Speaking',
        disconnected: 'Voice disconnected',
        failed: 'Voice connection failed',
        closed: 'Voice stopped',
        unavailable: 'Voice unavailable',
    }[fastRtcVoice.status];

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

                <div className='absolute flex justify-center w-full gap-10 z-20 bottom-24 border-t pt-4 border-white/10'>
                    {(fastRtcVoice.active || fastRtcVoice.error) && fastRtcStatusText && (
                        <div className={`absolute bottom-16 rounded-full border px-4 py-2 text-xs backdrop-blur-xl ${fastRtcVoice.error
                            ? 'border-red-500/40 bg-red-500/15 text-red-200'
                            : 'border-emerald-500/30 bg-black/45 text-emerald-100'
                        }`}>
                            {fastRtcStatusText}
                        </div>
                    )}
                    <button
                        type="button"
                        disabled={!fastRtcVoice.ready && !fastRtcVoice.active}
                        className={`rounded-full w-fit p-3 transition-all duration-300 cursor-pointer ${fastRtcVoice.active
                            ? 'bg-emerald-500 ring-2 ring-emerald-300/60'
                            : fastRtcVoice.ready
                                ? 'bg-emerald-500 hover:shadow-[0_0_18px_rgba(16,185,129,0.4)]'
                                : 'bg-white/10 border border-white/10 text-gray-500 cursor-not-allowed'
                        }`}
                        onPointerDown={handleVoicePointerDown}
                        onClick={handleVoiceClick}
                        title={fastRtcTitle}
                        aria-label={fastRtcTitle}
                    >
                        {fastRtcVoice.status === 'connecting'
                            ? <Loader2 size={20} className="text-white animate-spin" />
                            : (fastRtcVoice.active ? <MicOff size={20} className="text-white" /> : <Mic size={20} className={fastRtcVoice.ready ? 'text-white' : 'text-gray-500'} />)}
                    </button>
                    <div
                        className={`${issoundon ? 'bg-emerald-500' : 'bg-white/10 border border-white/10'} rounded-full p-3 cursor-pointer transition-all`}
                        onClick={handleSoundToggle}
                        title={issoundon ? 'Mute speaker' : 'Unmute speaker'}
                    >

                        {!issoundon ? <VolumeOff size={20} /> : <Volume2 size={20} />}
                    </div>
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
                                                disabled={isLoading || fastRtcVoice.active}
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={!input.trim() || isLoading || fastRtcVoice.active}
                                            className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center ${input.trim() && !isLoading && !fastRtcVoice.active
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
                                                disabled={isLoading || fastRtcVoice.active}
                                            />
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-2 pr-2">
                                            <button
                                                type="submit"
                                                disabled={!input.trim() || isLoading || fastRtcVoice.active}
                                                className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center ${input.trim() && !isLoading && !fastRtcVoice.active
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
