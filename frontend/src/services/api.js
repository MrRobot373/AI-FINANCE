import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

export const getTransactions = async (skip = 0, limit = 100) => {
    try {
        const response = await api.get(`/transactions/?skip=${skip}&limit=${limit}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching transactions:", error);
        return [];
    }
};

export const createTransaction = async (transactionData) => {
    const response = await api.post('/transactions/', transactionData);
    return response.data;
};

export const updateTransaction = async (transactionId, transactionData) => {
    const response = await api.patch(`/transactions/${transactionId}`, transactionData);
    return response.data;
};

export const deleteTransaction = async (transactionId) => {
    try {
        const response = await api.delete(`/transactions/${transactionId}`);
        return response;
    } catch (error) {
        console.error("Error deleting transaction:", error);
        throw error;
    }
};

export const getCategories = async () => {
    try {
        const response = await api.get('/categories/');
        return response.data;
    } catch (error) {
        console.error("Error fetching categories:", error);
        return [];
    }
}

export const createCategory = async (categoryData) => {
    const response = await api.post('/categories/', categoryData);
    return response.data;
};

export const updateCategory = async (categoryId, categoryData) => {
    const response = await api.patch(`/categories/${categoryId}`, categoryData);
    return response.data;
};

export const deleteCategory = async (categoryId) => {
    await api.delete(`/categories/${categoryId}`);
};

// Goals
export const getGoals = async () => {
    try {
        const response = await api.get('/goals/');
        return response.data;
    } catch (error) {
        console.error("Error fetching goals:", error);
        return [];
    }
};

export const createGoal = async (goalData) => {
    const response = await api.post('/goals/', goalData);
    return response.data;
};

export const deleteGoal = async (goalId) => {
    await api.delete(`/goals/${goalId}`);
};

export const updateGoal = async (goalId, goalData) => {
    const response = await api.patch(`/goals/${goalId}`, goalData);
    return response.data;
};

// Recurring Expenses
export const getRecurringExpenses = async () => {
    try {
        const response = await api.get('/recurring/');
        return response.data;
    } catch (error) {
        console.error("Error fetching recurring expenses:", error);
        return [];
    }
};

export const createRecurringExpense = async (recurringData) => {
    const response = await api.post('/recurring/', recurringData);
    return response.data;
};

export const deleteRecurringExpense = async (recurringId) => {
    await api.delete(`/recurring/${recurringId}`);
};


// Chat Sessions
export const getChatSessions = async (section = 'rag') => {
    try {
        const response = await api.get(`/ai/sessions?section=${section}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching chat sessions:", error);
        return [];
    }
};

export const createChatSession = async (title, section = 'rag') => {
    const response = await api.post(`/ai/sessions?section=${section}`, { title });
    return response.data;
};

export const updateChatSession = async (sessionId, title, section = 'rag') => {
    const response = await api.patch(`/ai/sessions/${sessionId}?section=${section}`, { title });
    return response.data;
};

export const deleteChatSession = async (sessionId, section = 'rag') => {
    await api.delete(`/ai/sessions/${sessionId}?section=${section}`);
};

export const getChatMessages = async (sessionId, section = 'rag') => {
    try {
        const response = await api.get(`/ai/sessions/${sessionId}/messages?section=${section}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching chat messages:", error);
        return [];
    }
};

export const updateRecurringExpense = async (recurringId, recurringData) => {
    const response = await api.patch(`/recurring/${recurringId}`, recurringData);
    return response.data;
};

export default api;
