import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBase';

const apiBaseUrl = getApiBaseUrl();

// Dataset Upload
export const uploadDataset = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post(`${apiBaseUrl}/train/upload-dataset`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

// Training Jobs
export const createTrainingJob = async (jobData) => {
    const response = await axios.post(`${API_URL}/train/jobs`, jobData);
    return response.data;
};

export const getTrainingJobs = async () => {
    const response = await axios.get(`${API_URL}/train/jobs`);
    return response.data;
};

export const getTrainingJob = async (jobId) => {
    const response = await axios.get(`${API_URL}/train/jobs/${jobId}`);
    return response.data;
};

export const startTraining = async (jobId) => {
    const response = await axios.post(`${API_URL}/train/jobs/${jobId}/start`);
    return response.data;
};

export const stopTraining = async (jobId) => {
    const response = await axios.post(`${API_URL}/train/jobs/${jobId}/stop`);
    return response.data;
};

export const deleteTrainingJob = async (jobId) => {
    await axios.delete(`${API_URL}/train/jobs/${jobId}`);
};

// Training Progress Stream
export const streamTrainingProgress = (jobId, onProgress, onComplete, onError) => {
    const eventSource = new EventSource(`${API_URL}/train/jobs/${jobId}/stream`);

    eventSource.onmessage = (event) => {
        if (event.data === '[DONE]') {
            eventSource.close();
            if (onComplete) onComplete();
            return;
        }

        try {
            const data = JSON.parse(event.data);
            if (data.error) {
                eventSource.close();
                if (onError) onError(data.error);
            } else {
                if (onProgress) onProgress(data);
            }
        } catch (e) {
            console.error('Failed to parse SSE data:', e);
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        eventSource.close();
        if (onError) onError('Connection error');
    };

    return eventSource;
};

// Models
export const getModels = async () => {
    const response = await axios.get(`${API_URL}/train/models`);
    return response.data;
};

export const deleteModel = async (modelName) => {
    await axios.delete(`${API_URL}/train/models/${modelName}`);
};
