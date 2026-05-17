import { create } from 'zustand';
import {
    createGoal,
    createTransaction,
    getChatSessions,
    createChatSession,
    updateChatSession,
    deleteChatSession,
    getChatMessages,
    getCategories
} from '../services/api';
import { getApiBaseUrl } from '../utils/apiBase';

// Define API_URL for direct fetch calls (not using axios instance)
const API_URL = getApiBaseUrl();

export const useChatStore = create((set, get) => ({
    sessions: [],
    currentSessionId: null,
    messages: [],
    isLoading: false,
    error: null,
    activeSection: 'rag', // 'rag', 'avatar', 'dashboard'

    setSection: (section) => {
        set({ activeSection: section, currentSessionId: null, messages: [], sessions: [] });
        get().fetchSessions();
    },

    // --- Session Management ---
    fetchSessions: async () => {
        try {
            const { activeSection } = get();
            const sessions = await getChatSessions(activeSection);
            set({ sessions });
        } catch (error) {
            console.error("Failed to fetch sessions", error);
        }
    },

    createNewSession: async () => {
        try {
            const { activeSection } = get();
            const session = await createChatSession("New Chat", activeSection);
            set(state => ({
                sessions: [session, ...state.sessions],
                currentSessionId: session.id,
                messages: []
            }));
            return session.id;
        } catch (error) {
            console.error("Failed to create session", error);
        }
    },

    selectSession: async (sessionId) => {
        set({ currentSessionId: sessionId, isLoading: true });
        try {
            const { activeSection } = get();
            const messages = await getChatMessages(sessionId, activeSection);
            set({ messages, isLoading: false });
        } catch (error) {
            console.error("Failed to fetch messages", error);
            set({ isLoading: false });
        }
    },

    updateSessionTitle: async (sessionId, newTitle) => {
        try {
            const { activeSection } = get();
            const updated = await updateChatSession(sessionId, newTitle, activeSection);
            set(state => ({
                sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
            }));
        } catch (error) {
            console.error("Failed to update session title", error);
        }
    },

    renameSession: async (sessionId, newTitle) => {
        try {
            const { activeSection } = get();
            const updated = await updateChatSession(sessionId, newTitle, activeSection);
            set(state => ({
                sessions: state.sessions.map(s => s.id === sessionId ? updated : s)
            }));
        } catch (error) {
            console.error("Failed to rename session", error);
        }
    },

    deleteSession: async (sessionId) => {
        try {
            const { activeSection } = get();
            await deleteChatSession(sessionId, activeSection);
            set(state => ({
                sessions: state.sessions.filter(s => s.id !== sessionId),
                currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
                messages: state.currentSessionId === sessionId ? [] : state.messages
            }));
        } catch (error) {
            console.error("Failed to delete session", error);
        }
    },

    // --- Messaging ---
    addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

    startAssistantMessage: () => set((state) => ({
        messages: [
            ...state.messages,
            { role: 'assistant', content: '', created_at: new Date().toISOString() }
        ]
    })),

    appendAssistantDelta: (delta) => set((state) => {
        const messages = [...state.messages];
        const last = messages[messages.length - 1];

        if (!last || last.role !== 'assistant') {
            messages.push({ role: 'assistant', content: delta, created_at: new Date().toISOString() });
        } else {
            messages[messages.length - 1] = {
                ...last,
                content: `${last.content || ''}${delta || ''}`,
            };
        }

        return { messages };
    }),

    sendMessage: async (content, mode = 'chat') => {
        const { addMessage, currentSessionId, createNewSession } = get();

        let sessionId = currentSessionId;
        if (!sessionId) {
            sessionId = await createNewSession();
        }

        // Add user message locally immediately
        const userMsg = { role: 'user', content, created_at: new Date().toISOString() };
        addMessage(userMsg);
        set({ isLoading: true, error: null });

        // Add placeholder for assistant message
        addMessage({ role: 'assistant', content: '', created_at: new Date().toISOString() });

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000);
        });

        try {
            const token = import.meta.env.VITE_API_TOKEN;
            const { activeSection } = get();
            console.log('Sending request to:', `${API_URL}/ai/chat/${sessionId}?section=${activeSection}`);

            const fetchPromise = fetch(`${API_URL}/ai/chat/${sessionId}?section=${activeSection}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: content, mode })
            });

            const response = await Promise.race([fetchPromise, timeoutPromise]);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantMessage = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('Stream completed');
                    break;
                }

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') break;

                        try {
                            const parsed = JSON.parse(data);

                            // Handle Error from Backend
                            if (parsed.error) {
                                console.error("AI Error:", parsed.error);
                                assistantMessage = "Error: " + parsed.error;
                                set((state) => {
                                    const newMessages = [...state.messages];
                                    newMessages[newMessages.length - 1] = {
                                        role: 'assistant',
                                        content: assistantMessage,
                                        created_at: new Date().toISOString()
                                    };
                                    return { messages: newMessages };
                                });
                                break;
                            }

                            if (parsed.content) {
                                assistantMessage += parsed.content;

                                // Update the last message (assistant's)
                                set((state) => {
                                    const newMessages = [...state.messages];
                                    newMessages[newMessages.length - 1] = {
                                        role: 'assistant',
                                        content: assistantMessage,
                                        created_at: new Date().toISOString()
                                    };
                                    return { messages: newMessages };
                                });
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data:', e, 'Line:', line);
                        }
                    }
                }
            }

            // Check for actions after stream is complete
            // Improved Regex to handle variations (make 'json' optional)
            const actionMatch = assistantMessage.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (actionMatch) {
                try {
                    const actionData = JSON.parse(actionMatch[1]);
                    console.log("Executing Action:", actionData);

                    if (actionData.action === 'create_goal') {
                        await createGoal(actionData.data);
                        addMessage({ role: 'assistant', content: '✅ Goal created successfully!', created_at: new Date().toISOString() });
                    } else if (actionData.action === 'add_transaction') {
                        let categoryId = actionData.data.category_id;

                        // Identify if we need to fetch a real category ID
                        const isInvalidId = !categoryId || categoryId === "USE_ACTUAL_UUID_FROM_CATEGORIES";

                        if (isInvalidId) {
                            try {
                                const categories = await getCategories();
                                if (categories && categories.length > 0) {
                                    // Try to match by description if possible
                                    const desc = (actionData.data.description || '').toLowerCase();
                                    // Or prompt text if available? No, we don't have prompt here.
                                    // Best effort: find category match
                                    const match = categories.find(c => desc.includes(c.name.toLowerCase()));
                                    categoryId = match ? match.id : categories[0].id; // Fallback to first category
                                }
                            } catch (err) {
                                console.error("Failed to fetch categories for default", err);
                            }
                        }

                        if (!categoryId) {
                            throw new Error("No category available for transaction.");
                        }

                        await createTransaction({
                            ...actionData.data,
                            date: new Date().toISOString(),
                            category_id: categoryId
                        });
                        addMessage({ role: 'assistant', content: '✅ Transaction added successfully!', created_at: new Date().toISOString() });
                    }
                } catch (e) {
                    console.error("Failed to execute action", e);
                    addMessage({ role: 'assistant', content: '❌ Failed to execute the requested action: ' + e.message, created_at: new Date().toISOString() });
                }
            }

            // Refresh sessions to update timestamp/order
            get().fetchSessions();

        } catch (error) {
            console.error('Chat error:', error);
            set({ error: error.message });

            // Update the last message with error
            set((state) => {
                const newMessages = [...state.messages];
                if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
                    newMessages[newMessages.length - 1] = {
                        role: 'assistant',
                        content: 'Sorry, I encountered an error. Please try again. Error: ' + error.message,
                        created_at: new Date().toISOString()
                    };
                }
                return { messages: newMessages };
            });
        } finally {
            console.log('Setting isLoading to false');
            set({ isLoading: false });
        }
    }
}));
