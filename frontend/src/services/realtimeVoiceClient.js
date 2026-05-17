import { wsApiUrl } from '../utils/apiBase';

export class RealtimeVoiceClient {
    constructor({ onEvent } = {}) {
        this.onEvent = onEvent;
        this.socket = null;
    }

    connect() {
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const socket = new WebSocket(wsApiUrl('/avatar/realtime'));
            this.socket = socket;

            socket.onopen = () => resolve();
            socket.onerror = () => reject(new Error('Realtime voice connection failed'));
            socket.onmessage = (event) => {
                try {
                    this.onEvent?.(JSON.parse(event.data));
                } catch (error) {
                    console.error('Realtime voice event parse failed:', error);
                }
            };
            socket.onclose = () => {
                this.onEvent?.({ type: 'state', value: 'disconnected' });
            };
        });
    }

    send(payload) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
        this.socket.send(JSON.stringify(payload));
        return true;
    }

    close() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.send({ type: 'stop_session' });
        }
        this.socket?.close();
        this.socket = null;
    }
}

export const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = String(reader.result || '');
            resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
