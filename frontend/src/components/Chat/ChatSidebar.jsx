import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Plus, Search, Trash2, MessageCircle, MoreHorizontal } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import MoreOptionsModel from '../MoreOptionsModel';
import { useNavigate } from 'react-router-dom';

const ChatSidebar = ({ section }) => {
    const [openModalSessionId, setOpenModalSessionId] = useState(null);
    const [editingSessionId, setEditingSessionId] = useState(null);
    const [editedTitle, setEditedTitle] = useState('');
    const { sessions, currentSessionId, fetchSessions, createNewSession, selectSession, deleteSession, updateSessionTitle, setSection, activeSection } = useChatStore();

    const nav = useNavigate()

    useEffect(() => {
        if (section && section !== activeSection) {
            setSection(section);
        } else {
            fetchSessions();
        }
    }, [section, setSection, activeSection]);

    const handleNewChat = async () => {
        try {
            await createNewSession();
            fetchSessions();
        } catch (error) {
            console.error('Error creating new session:', error);
        }
    };

    const handleMoreOptions = (e, sessionId) => {
        e.stopPropagation();
        setOpenModalSessionId(openModalSessionId === sessionId ? null : sessionId);
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this chat?')) {
            await deleteSession(id);
        }
    };

    const handleEdit = (e, id) => {
        e.stopPropagation();
        const session = sessions.find(s => s.id === id);
        if (session) {
            setEditedTitle(session.title);
        }
        setEditingSessionId(id);
        setOpenModalSessionId(null);
    };

    // Prevent sessions updates from resetting the edited title
    useEffect(() => {
        if (editingSessionId && !editedTitle) {
            const session = sessions.find(s => s.id === editingSessionId);
            if (session) {
                setEditedTitle(session.title);
            }
        }
    }, [sessions, editingSessionId]);

    const handleTitleSubmit = (e, id) => {
        e.preventDefault();
        updateSessionTitle(id, editedTitle);
        setEditingSessionId(null);
        setEditedTitle('');
    };

    const handleTitleChange = (e) => {
        setEditedTitle(e.target.value);
    };

    const handleTitleBlur = (id) => {
        if (editedTitle.trim()) {
            updateSessionTitle(id, editedTitle);
        }
        setEditingSessionId(null);
        setEditedTitle('');
    };

    // Group sessions by date
    const groupedSessions = {
        Today: [],
        Yesterday: [],
        Previous: []
    };

    sessions.forEach(session => {
        const date = new Date(session.updated_at || session.created_at);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            groupedSessions.Today.push(session);
        } else if (date.toDateString() === yesterday.toDateString()) {
            groupedSessions.Yesterday.push(session);
        } else {
            groupedSessions.Previous.push(session);
        }
    });

    const trainModel = (file) => {
        fetch('/api/train-model', {
            method: 'POST',
            body: file,
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        })
    }

    return (
        <div className="w-full h-[calc(100vh-6.1rem)] bg-black/20 backdrop-blur-xl border border-white/10 rounded-l-3xl shadow-2xl flex flex-col overflow-hidden relative">

            <div className="absolute top-[2%] right-[-25%] w-[250px] h-[250px] 
    bg-green-500/20 rounded-full blur-[50px]" />
            <div className="absolute top-[-95px] left-[-55px] w-[250px] h-[250px] 
    bg-blue-500/15 rounded-full blur-[50px]" />
            <div className="absolute bottom-[-2%] right-[30%] w-[250px] h-[300px] 
    bg-blue-400/30 rounded-full blur-[160px]" />
            {/* Header */}
            <div className="p-5 z-10 flex items-center justify-between border-b border-white/5">
                <h2 className="text-base font-semibold text-white tracking-tight">History Chat</h2>
                <button
                    onClick={handleNewChat}
                    className="bg-emerald-500/10 cursor-pointer hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-full py-1.5 px-3 flex items-center gap-1.5 transition-all text-xs font-medium hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                >
                    <Plus size={14} />
                    <span>New Chat</span>
                </button>
            </div>

            {/* List */}
            <div className="flex-1 relative overflow-y-auto px-4 py-4 space-y-5 scrollbar-hide">

                {Object.entries(groupedSessions).map(([group, items]) => (
                    items.length > 0 && (
                        <div key={group}>
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2.5 px-2">{group}</h3>
                            <div className="space-y-1.5">
                                {items.map(session => (
                                    <div
                                        key={session.id}
                                        onClick={() => selectSession(session.id)}
                                        className={`relative w-full text-left px-3.5 py-3 rounded-xl cursor-pointer transition-all flex items-center justify-between group ${currentSessionId === session.id
                                            ? 'bg-emerald-500/10 text-white border border-emerald-500/20 shadow-sm'
                                            : 'text-gray-400 border border-transparent hover:bg-white/5 hover:text-gray-300 hover:border-white/10'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
                                            <MessageSquare size={14} className={`shrink-0 ${currentSessionId === session.id ? 'text-emerald-400' : 'text-gray-600 group-hover:text-gray-500'
                                                }`} />
                                            <form onSubmit={(e) => handleTitleSubmit(e, session.id)}>
                                                <input
                                                    type="text"
                                                    value={editingSessionId === session.id ? editedTitle : session.title}
                                                    onBlur={() => handleTitleBlur(session.id)}
                                                    ref={(el) => {
                                                        if (el && editingSessionId === session.id) {
                                                            el.focus();
                                                        }
                                                    }}
                                                    onChange={handleTitleChange}
                                                    onClick={(e) => editingSessionId === session.id && e.stopPropagation()}
                                                    readOnly={editingSessionId !== session.id}
                                                    className={`w-full text-xs font-medium bg-transparent outline-none truncate transition-all ${editingSessionId === session.id
                                                        ? 'cursor-text border border-emerald-500/50 bg-emerald-500/5 px-2 py-1 rounded'
                                                        : 'cursor-pointer border-none'
                                                        }`}
                                                />
                                            </form>
                                        </div>
                                        <button
                                            onClick={(e) => handleMoreOptions(e, session.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 hover:text-emerald-400 rounded-lg transition-all shrink-0"
                                        >
                                            <MoreHorizontal size={16} />
                                        </button>
                                        {openModalSessionId === session.id && (
                                            <div className="absolute right-0 top-full mt-1 z-50">
                                                <MoreOptionsModel
                                                    sessionId={session.id}
                                                    onClose={() => setOpenModalSessionId(null)}
                                                    onDelete={(e) => handleDelete(e, session.id)}
                                                    onEdit={(e) => handleEdit(e, session.id)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                ))}

                {sessions.length === 0 && (
                    <div className="text-center text-gray-600 py-12">
                        <MessageCircle size={28} className="mx-auto mb-2 opacity-20" />
                        <p className="text-xs">No chats yet</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatSidebar;
