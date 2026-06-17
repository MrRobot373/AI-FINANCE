import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, User, Sparkles, Upload } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import ChatSidebar from './ChatSidebar';
import FloatingNav from '../FloatingNav';
import { useNavigate } from 'react-router-dom';
import MessageContent, { LoadingDots } from '../../utils/messageFormatting.jsx';

const ChatInterface = () => {
    const { messages = [], isLoading, sendMessage, currentSessionId, setSection } = useChatStore();

    useEffect(() => {
        setSection('rag');
    }, [setSection]);

    const [input, setInput] = useState('');
    const [ischatting, setIschatting] = useState(false)
    const [isAdmin, setIsAdmin] = useState(localStorage.getItem('isAdmin'))
    const messagesEndRef = useRef(null);
    const nav = useNavigate()
    const hasPendingAssistant = isLoading
        && messages[messages.length - 1]?.role === 'assistant'
        && !messages[messages.length - 1]?.content?.trim();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (messages && messages.length > 0) {
            setIschatting(true);
        } else {
            setIschatting(false);
        }
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        setIschatting(true);
        if (!input.trim() || isLoading) return;
        sendMessage(input);
        setInput('');
    };

    return (
        <div className='min-h-screen bg-gradient-to-br from-[#0a0f0d] via-[#050505] to-[#0a0f0d] relative overflow-hidden'>
            {/* <div>
                <button className='bg-white/40'>
                    Click here to upload
                </button>
            </div> */}
            <div className="flex justify-end py-2.5 absolute top-5 right-5 z-100">
                {
                    isAdmin === "true" ? <button
                        onClick={() => {
                            nav('/train-model')
                        }}
                        className="bg-emerald-500/10 cursor-pointer hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-full py-1.5 px-3 flex items-center gap-1.5 transition-all text-xs font-medium hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                    >
                        <Upload size={20} />
                    </button> : <></>
                }

            </div>
            {/* Ambient background glow */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-green-500/5 rounded-full blur-[120px] pointer-events-none"></div>
            {/* Glassmorphism ambient color layers */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Left green glow */}
                <div className="absolute top-[5%] left-[2%] w-[320px] h-[320px] 
    bg-emerald-400/25 rounded-full blur-[90px]" />
                <div className="absolute top-[65%] left-[15%] w-[450px] h-[300px] 
    bg-emerald-400/30 rounded-full blur-[95px]" />
                <div className="absolute top-[55%] right-[30%] w-[450px] h-[300px] 
    bg-blue-400/30 rounded-full blur-[95px]" />
                {/* Center lime glow */}
                <div className="absolute top-[20%] left-[22%] w-[250px] h-[250px] 
    bg-blue-400/30 rounded-full blur-[95px]" />
            </div>
            <FloatingNav />
            <div className='absolute text-white top-5 left-5'>
                <span className='text-[#33A8A1] text-3xl'>Fin</span><span className='text-3xl'>Wise</span>
                <br />
                <span className='text-xl'>
                    Chat
                </span>
            </div>
            <div className='flex pt-24 relative' style={{ minHeight: 'calc(100vh - 6rem)' }}>
                {/* Main Chat Container - Centered with Glass Effect */}
                <div className="flex-1 flex items-center justify-center relative">
                    <div className="w-[1000px] h-[calc(100vh-6.1rem)] bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl flex flex-col relative overflow-hidden">
                        {/* Subtle inner glow */}
                        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent pointer-events-none"></div>
                        {/* Conditional Layout based on chatting state */}
                        {!ischatting ? (
                            /* Initial State - Centered Input */
                            <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10">
                                {/* Animated Green Orb */}
                                <div className="relative mb-2">
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 animate-pulse shadow-[0_0_60px_rgba(16,185,129,0.4)]"></div>
                                    <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-emerald-400/30 animate-spin" style={{ animationDuration: '3s' }}></div>
                                    <div className="absolute inset-3 w-18 h-18 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                                        <Sparkles className="text-emerald-400" size={32} />
                                    </div>
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
                                                    onChange={(e) => setInput(e.target.value)}
                                                    placeholder="Start your request, and let FinWise handle everything"
                                                    className="w-full bg-transparent border-none text-white placeholder-gray-500 py-3 focus:outline-none text-sm"
                                                    disabled={isLoading}
                                                />
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-2 pr-2">
                                                <button
                                                    type="submit"
                                                    disabled={!input.trim() || isLoading}
                                                    className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center ${input.trim() && !isLoading
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
                                                <MessageContent content={msg.content} className="text-[15px]" />
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
                                                    onChange={(e) => setInput(e.target.value)}
                                                    placeholder="Start your request, and let FinWise handle everything"
                                                    className="w-full bg-transparent border-none text-white placeholder-gray-500 py-3 focus:outline-none text-sm"
                                                    disabled={isLoading}
                                                />
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-2 pr-2">
                                                <button
                                                    type="submit"
                                                    disabled={!input.trim() || isLoading}
                                                    className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center ${input.trim() && !isLoading
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

                {/* Sidebar - Right Side with Glass Effect */}
                <aside className='sticky top-24 self-start h-[calc(100vh-10rem)] w-80'>
                    <ChatSidebar />
                </aside>
            </div>
        </div>
    );
};

export default ChatInterface;
