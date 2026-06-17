import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Bot, User, History, X } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import ChatSidebar from './ChatSidebar'
import MessageContent, { LoadingDots } from '../../utils/messageFormatting.jsx';

const SimpleChatInterface = () => {

    const [ismodel, setIsmodel] = useState(false)
    const { messages = [], isLoading, sendMessage, setSection } = useChatStore();

    useEffect(() => {
        setSection('dashboard');
    }, [setSection]);

    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const hasPendingAssistant = isLoading
        && messages[messages.length - 1]?.role === 'assistant'
        && !messages[messages.length - 1]?.content?.trim();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        sendMessage(input);
        setInput('');
    };

    const handleModelOpen = () => {
        setIsmodel(true)
    }

    const handleModelClose = () => {
        setIsmodel(false);
    }

    return (
        <div className="h-full flex flex-col border relative border-white/10 rounded-4xl overflow-hidden">
            <div className='absolute top-1 pr-6 w-full z-20 p-2 flex justify-end border border-x-0 border-t-0 border-b-white/10 transition-all' >
                <History size={22} onClick={handleModelOpen} className=" cursor-pointer text-emerald-400 hover:-rotate-360 duration-800 transition-all" />
            </div>

            {/* Sidebar Modal Overlay */}
            {ismodel && (
                <div className="absolute right-0 inset-0 z-30 bg-black/80 backdrop-blur-md flex flex-col animate-in slide-in-from-right duration-300">
                    <div className="absolute top-4 right-[calc(100%-69%)] z-40 cursor-pointer p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all" onClick={handleModelClose}>
                        <X size={20} className="text-white hover:rotate-180 duration-800 transition-all" />
                    </div>
                    <div className='w-[calc(100%-70%)] h-full right-0 absolute'>
                        <ChatSidebar section="dashboard" />
                    </div>
                </div>
            )}
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
                {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <Bot size={32} className="text-emerald-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">Finance AI Assistant</h3>
                            <p className="text-sm text-gray-400 max-w-md">
                                Ask questions about your finances, get tax advice, investment tips, and more.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="pt-8" >
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
                                {msg.role === 'assistant' && (
                                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-1">
                                        <Bot size={16} className="text-emerald-400" />
                                    </div>
                                )}

                                <div className={`max-w-[75%] rounded-xl px-4 py-3 ${msg.role === 'user'
                                    ? 'bg-emerald-500/10 text-white border border-emerald-500/20'
                                    : 'bg-white/5 text-gray-200 border border-white/10'
                                    }`}>
                                    <MessageContent content={msg.content} className="text-sm" />
                                </div>

                                {msg.role === 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-1">
                                        <User size={16} className="text-gray-300" />
                                    </div>
                                )}
                            </div>
                        ))}

                        {isLoading && !hasPendingAssistant && (
                            <div className="flex gap-3 justify-start">
                                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-1">
                                    <Bot size={16} className="text-emerald-400" />
                                </div>
                                <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-2">
                                    <LoadingDots />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-white/10">
                <form onSubmit={handleSubmit} className="w-full">
                    <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 flex items-center gap-2">
                        <div className="flex-1 px-3">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Ask about your finances..."
                                className="w-full bg-transparent border-none text-white placeholder-gray-500 py-2.5 focus:outline-none text-sm"
                                disabled={isLoading}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className={`p-2.5 rounded-lg transition-all duration-300 flex items-center justify-center ${input.trim() && !isLoading
                                ? 'bg-gradient-to-br from-emerald-500 to-green-600 text-white hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:scale-105'
                                : 'bg-white/5 text-gray-600 cursor-not-allowed border border-white/10'
                                }`}
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>

                    </div>
                </form>
            </div>
        </div>
    );
};

export default SimpleChatInterface;
