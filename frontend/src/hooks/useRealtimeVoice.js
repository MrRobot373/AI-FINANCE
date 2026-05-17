import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeVoiceClient } from '../services/realtimeVoiceClient';

const DEFAULT_AUDIO_CONFIG = {
    bufferSize: 4096,
    speechThreshold: 0.026,
    bargeInThreshold: 0.045,
    bargeInHoldMs: 120,
    silenceMs: 760,
    minSpeechMs: 420,
    maxSpeechMs: 15000,
    preRollMs: 260,
};

const calculateRms = (samples) => {
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
        sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
};

const appendBuffers = (buffers) => {
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;

    buffers.forEach((buffer) => {
        combined.set(buffer, offset);
        offset += buffer.length;
    });

    return combined;
};

const writeString = (view, offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i));
    }
};

const float32ToWav = (samples, sampleRate) => {
    const bytesPerSample = 2;
    const headerSize = 44;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = headerSize;
    for (let i = 0; i < samples.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += bytesPerSample;
    }

    return buffer;
};

const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
};

export function useRealtimeVoice({
    gender = 'male',
    enabled = true,
    isAssistantSpeaking = false,
    audioConfig = {},
    onFinalTranscript,
    onAssistantStart,
    onAssistantDelta,
    onAssistantDone,
    onSpeechChunk,
    onBargeIn,
    onError,
} = {}) {
    const configRef = useRef({ ...DEFAULT_AUDIO_CONFIG, ...audioConfig });
    const [status, setStatusState] = useState('idle');
    const [active, setActive] = useState(false);
    const [recording, setRecording] = useState(false);
    const [lastTranscript, setLastTranscript] = useState('');

    const clientRef = useRef(null);
    const audioContextRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const sourceRef = useRef(null);
    const processorRef = useRef(null);
    const silentGainRef = useRef(null);
    const micOpenRef = useRef(false);

    const preRollRef = useRef([]);
    const speechBuffersRef = useRef([]);
    const speechActiveRef = useRef(false);
    const speechStartedAtRef = useRef(0);
    const lastVoiceAtRef = useRef(0);
    const bargeCandidateAtRef = useRef(null);
    const lastInterruptAtRef = useRef(0);

    const activeRef = useRef(false);
    const enabledRef = useRef(enabled);
    const genderRef = useRef(gender);
    const statusRef = useRef('idle');
    const assistantSpeakingRef = useRef(isAssistantSpeaking);
    const onBargeInRef = useRef(onBargeIn);

    useEffect(() => {
        configRef.current = { ...DEFAULT_AUDIO_CONFIG, ...audioConfig };
    }, [audioConfig]);

    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    useEffect(() => {
        genderRef.current = gender;
    }, [gender]);

    useEffect(() => {
        activeRef.current = active;
    }, [active]);

    useEffect(() => {
        assistantSpeakingRef.current = isAssistantSpeaking;
    }, [isAssistantSpeaking]);

    useEffect(() => {
        onBargeInRef.current = onBargeIn;
    }, [onBargeIn]);

    const setStatus = useCallback((nextStatus) => {
        statusRef.current = nextStatus;
        setStatusState(nextStatus);
    }, []);

    const handleEvent = useCallback((event) => {
        if (event.type === 'state') {
            setStatus(event.value || 'idle');
            return;
        }
        if (event.type === 'final_transcript') {
            setLastTranscript(event.text || '');
            onFinalTranscript?.(event.text || '', event);
            return;
        }
        if (event.type === 'assistant_start') {
            onAssistantStart?.(event);
            return;
        }
        if (event.type === 'assistant_text_delta') {
            onAssistantDelta?.(event.text || '', event);
            return;
        }
        if (event.type === 'speech_chunk') {
            onSpeechChunk?.(event);
            return;
        }
        if (event.type === 'assistant_done') {
            onAssistantDone?.(event);
            return;
        }
        if (event.type === 'no_speech') {
            setStatus(activeRef.current ? 'listening' : 'idle');
            return;
        }
        if (event.type === 'error') {
            setStatus('error');
            onError?.(event.message || 'Realtime voice error', event);
        }
    }, [onAssistantDelta, onAssistantDone, onAssistantStart, onError, onFinalTranscript, onSpeechChunk, setStatus]);

    const ensureClient = useCallback(async () => {
        if (!clientRef.current) {
            clientRef.current = new RealtimeVoiceClient({ onEvent: handleEvent });
        }
        await clientRef.current.connect();
        return clientRef.current;
    }, [handleEvent]);

    const trimPreRoll = useCallback((sampleRate) => {
        const maxSamples = Math.floor(sampleRate * (configRef.current.preRollMs / 1000));
        let totalSamples = preRollRef.current.reduce((sum, buffer) => sum + buffer.length, 0);

        while (totalSamples > maxSamples && preRollRef.current.length > 1) {
            const removed = preRollRef.current.shift();
            totalSamples -= removed.length;
        }
    }, []);

    const sendInterrupt = useCallback(() => {
        const now = performance.now();
        if (now - lastInterruptAtRef.current < 350) return;

        lastInterruptAtRef.current = now;
        clientRef.current?.send({ type: 'interrupt' });
        onBargeInRef.current?.();
        setStatus('interrupted');
    }, [setStatus]);

    const startSpeechSegment = useCallback((now, sampleRate) => {
        if (speechActiveRef.current) return;

        const busyState = ['thinking', 'synthesizing'].includes(statusRef.current);
        if (assistantSpeakingRef.current || busyState) {
            sendInterrupt();
        }

        clientRef.current?.send({ type: 'start_session', gender: genderRef.current });
        speechBuffersRef.current = [...preRollRef.current];
        preRollRef.current = [];
        speechActiveRef.current = true;
        speechStartedAtRef.current = now;
        lastVoiceAtRef.current = now;
        setRecording(true);
        setStatus('speech_detected');
        trimPreRoll(sampleRate);
    }, [sendInterrupt, setStatus, trimPreRoll]);

    const finishSpeechSegment = useCallback((respond = true) => {
        if (!speechActiveRef.current) return;

        const sampleRate = audioContextRef.current?.sampleRate || 44100;
        const buffers = speechBuffersRef.current;
        const totalSamples = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
        const speechMs = (totalSamples / sampleRate) * 1000;

        speechActiveRef.current = false;
        speechBuffersRef.current = [];
        bargeCandidateAtRef.current = null;
        setRecording(false);

        if (speechMs < configRef.current.minSpeechMs) {
            setStatus(activeRef.current ? 'listening' : 'idle');
            return;
        }

        try {
            const wav = float32ToWav(appendBuffers(buffers), sampleRate);
            const data = arrayBufferToBase64(wav);

            clientRef.current?.send({
                type: 'audio_chunk',
                data,
                mime_type: 'audio/wav',
            });
            clientRef.current?.send({ type: 'end_utterance', respond });
            setStatus('transcribing');
        } catch (error) {
            setStatus('error');
            onError?.(error.message || 'Unable to send voice audio');
        }
    }, [onError, setStatus]);

    const handleAudioProcess = useCallback((event) => {
        if (!activeRef.current || !enabledRef.current) return;

        const input = event.inputBuffer.getChannelData(0);
        const frame = new Float32Array(input.length);
        frame.set(input);

        const sampleRate = audioContextRef.current?.sampleRate || event.inputBuffer.sampleRate || 44100;
        const rms = calculateRms(frame);
        const now = performance.now();
        const protectedTranscribing = statusRef.current === 'transcribing';

        if (!speechActiveRef.current) {
            preRollRef.current.push(frame);
            trimPreRoll(sampleRate);
        }

        if (protectedTranscribing) {
            return;
        }

        if (!speechActiveRef.current) {
            if (assistantSpeakingRef.current) {
                if (rms > configRef.current.bargeInThreshold) {
                    if (!bargeCandidateAtRef.current) {
                        bargeCandidateAtRef.current = now;
                    }
                    if (now - bargeCandidateAtRef.current >= configRef.current.bargeInHoldMs) {
                        startSpeechSegment(now, sampleRate);
                    }
                } else {
                    bargeCandidateAtRef.current = null;
                }
            } else if (rms > configRef.current.speechThreshold) {
                startSpeechSegment(now, sampleRate);
            }
        }

        if (!speechActiveRef.current) return;

        speechBuffersRef.current.push(frame);

        if (rms > configRef.current.speechThreshold) {
            lastVoiceAtRef.current = now;
        }

        const speechDuration = now - speechStartedAtRef.current;
        const silenceDuration = now - lastVoiceAtRef.current;

        if (
            speechDuration >= configRef.current.minSpeechMs
            && silenceDuration >= configRef.current.silenceMs
        ) {
            finishSpeechSegment(true);
            return;
        }

        if (speechDuration >= configRef.current.maxSpeechMs) {
            finishSpeechSegment(true);
        }
    }, [finishSpeechSegment, startSpeechSegment, trimPreRoll]);

    const cleanupAudio = useCallback(() => {
        if (processorRef.current) {
            processorRef.current.onaudioprocess = null;
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        sourceRef.current?.disconnect();
        sourceRef.current = null;
        silentGainRef.current?.disconnect();
        silentGainRef.current = null;

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }

        micOpenRef.current = false;
        speechActiveRef.current = false;
        speechBuffersRef.current = [];
        preRollRef.current = [];
        bargeCandidateAtRef.current = null;
        setRecording(false);
    }, []);

    const startAudioCapture = useCallback(async () => {
        if (!enabledRef.current || micOpenRef.current) return;
        if (!navigator.mediaDevices?.getUserMedia) {
            const message = 'Browser voice recording is not supported.';
            setStatus('error');
            onError?.(message);
            return;
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            const message = 'Web Audio is not supported in this browser.';
            setStatus('error');
            onError?.(message);
            return;
        }

        const client = await ensureClient();
        if (!client) return;

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });

        const audioContext = new AudioContext();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(configRef.current.bufferSize, 1, 1);
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;

        processor.onaudioprocess = handleAudioProcess;
        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(audioContext.destination);

        audioContextRef.current = audioContext;
        mediaStreamRef.current = stream;
        sourceRef.current = source;
        processorRef.current = processor;
        silentGainRef.current = silentGain;
        micOpenRef.current = true;
        setStatus('listening');
    }, [ensureClient, handleAudioProcess, onError, setStatus]);

    const startRecording = useCallback(async () => {
        if (!activeRef.current) {
            setActive(true);
            activeRef.current = true;
        }
        await startAudioCapture();
    }, [startAudioCapture]);

    const stopRecording = useCallback((sendEnd = true) => {
        if (speechActiveRef.current && sendEnd) {
            finishSpeechSegment(true);
        } else {
            speechActiveRef.current = false;
            speechBuffersRef.current = [];
            setRecording(false);
        }
    }, [finishSpeechSegment]);

    const start = useCallback(async () => {
        setActive(true);
        activeRef.current = true;
        await ensureClient();
        await startAudioCapture();
    }, [ensureClient, startAudioCapture]);

    const stop = useCallback(() => {
        setActive(false);
        activeRef.current = false;
        cleanupAudio();
        clientRef.current?.close();
        clientRef.current = null;
        setStatus('idle');
    }, [cleanupAudio, setStatus]);

    const interrupt = useCallback(() => {
        sendInterrupt();
        speechActiveRef.current = false;
        speechBuffersRef.current = [];
        setRecording(false);
    }, [sendInterrupt]);

    useEffect(() => {
        return () => {
            stop();
        };
    }, [stop]);

    return {
        active,
        recording,
        status,
        lastTranscript,
        start,
        startRecording,
        stopRecording,
        stop,
        interrupt,
    };
}
