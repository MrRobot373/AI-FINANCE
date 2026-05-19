import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../utils/apiBase';

const waitForIceGathering = (peerConnection, timeoutMs = 2500) => {
    if (peerConnection.iceGatheringState === 'complete') return Promise.resolve();

    return new Promise((resolve) => {
        const timeout = window.setTimeout(done, timeoutMs);

        function done() {
            window.clearTimeout(timeout);
            peerConnection.removeEventListener('icegatheringstatechange', onStateChange);
            resolve();
        }

        function onStateChange() {
            if (peerConnection.iceGatheringState === 'complete') {
                done();
            }
        }

        peerConnection.addEventListener('icegatheringstatechange', onStateChange);
    });
};

const createWebRtcId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `finwise-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function useFastRtcVoice() {
    const [health, setHealth] = useState(null);
    const [status, setStatus] = useState('idle');
    const [active, setActive] = useState(false);
    const [remoteStream, setRemoteStream] = useState(null);
    const [error, setError] = useState('');
    const [inputLevel, setInputLevel] = useState(0);
    const [lastEvent, setLastEvent] = useState('');

    const peerConnectionRef = useRef(null);
    const dataChannelRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const activeRef = useRef(false);
    const audioContextRef = useRef(null);
    const inputLevelFrameRef = useRef(null);
    const lastInputLevelUpdateRef = useRef(0);

    const teardownInputMeter = useCallback(() => {
        if (inputLevelFrameRef.current) {
            window.cancelAnimationFrame(inputLevelFrameRef.current);
            inputLevelFrameRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }

        setInputLevel(0);
    }, []);

    const setupInputMeter = useCallback((stream) => {
        teardownInputMeter();

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        try {
            const audioContext = new AudioContextClass();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 1024;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            audioContextRef.current = audioContext;

            const samples = new Uint8Array(analyser.fftSize);
            const readLevel = (timestamp = 0) => {
                analyser.getByteTimeDomainData(samples);

                let sum = 0;
                for (let index = 0; index < samples.length; index += 1) {
                    const centered = (samples[index] - 128) / 128;
                    sum += centered * centered;
                }

                if (timestamp - lastInputLevelUpdateRef.current > 90) {
                    lastInputLevelUpdateRef.current = timestamp;
                    setInputLevel(Math.min(1, Math.sqrt(sum / samples.length) * 5));
                }

                inputLevelFrameRef.current = window.requestAnimationFrame(readLevel);
            };

            inputLevelFrameRef.current = window.requestAnimationFrame(readLevel);
        } catch (err) {
            console.warn('FastRTC microphone level meter failed:', err);
        }
    }, [teardownInputMeter]);

    const handleDataChannelMessage = useCallback((event) => {
        let message = event.data;
        try {
            message = JSON.parse(event.data);
        } catch {
            // FastRTC messages are normally JSON, but keep raw messages harmless.
        }

        const type = typeof message === 'object' ? message.type : '';
        const data = typeof message === 'object' ? message.data ?? message.message : message;
        const eventText = Array.isArray(data) ? data.join(', ') : String(data || '');

        if (type === 'log') {
            setLastEvent(eventText);
            if (eventText === 'started_talking') setStatus('hearing');
            if (eventText === 'pause_detected') setStatus('processing');
            if (eventText === 'response_starting') setStatus('speaking');
            return;
        }

        if (type === 'warning') {
            setLastEvent(eventText);
            return;
        }

        if (type === 'error') {
            setError(eventText || 'FastRTC voice pipeline failed');
            setStatus('error');
            return;
        }

        if (type === 'end_stream') {
            setStatus('idle');
        }
    }, []);

    const refreshHealth = useCallback(async () => {
        try {
            const response = await fetch(apiUrl('/avatar/rtc/health'));
            if (!response.ok) throw new Error(`FastRTC health returned ${response.status}`);
            const data = await response.json();
            setHealth(data);
            return data;
        } catch (err) {
            setHealth(null);
            setError(err.message || 'FastRTC health check failed');
            return null;
        }
    }, []);

    useEffect(() => {
        refreshHealth();
    }, [refreshHealth]);

    const stop = useCallback(() => {
        activeRef.current = false;
        setActive(false);
        setStatus('idle');
        setLastEvent('');

        dataChannelRef.current?.close();
        dataChannelRef.current = null;
        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;

        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;

        remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
        remoteStreamRef.current = null;
        setRemoteStream(null);
        teardownInputMeter();
    }, [teardownInputMeter]);

    const start = useCallback(async () => {
        setError('');
        const currentHealth = health || await refreshHealth();

        if (!currentHealth?.enabled || !currentHealth?.available || !currentHealth?.mounted) {
            const missing = currentHealth?.missing_dependencies?.join(', ');
            const message = missing
                ? `FastRTC voice is not ready. Missing: ${missing}`
                : 'FastRTC voice is not enabled on the backend.';
            setError(message);
            setStatus('unavailable');
            return false;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            setError('Browser microphone capture is not supported.');
            setStatus('error');
            return false;
        }

        if (!window.RTCPeerConnection) {
            setError('Browser WebRTC is not supported.');
            setStatus('error');
            return false;
        }

        try {
            activeRef.current = true;
            setActive(true);
            setStatus('requesting_microphone');
            const localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            const peerConnection = new RTCPeerConnection();
            const dataChannel = peerConnection.createDataChannel('finwise-events');
            const nextRemoteStream = new MediaStream();
            const webrtcId = createWebRtcId();

            dataChannelRef.current = dataChannel;
            dataChannel.onopen = () => {
                if (activeRef.current) setStatus('listening');
            };
            dataChannel.onmessage = handleDataChannelMessage;
            dataChannel.onerror = () => {
                setError('FastRTC control channel failed.');
                setStatus('error');
            };
            dataChannel.onclose = () => {
                if (activeRef.current) setStatus('disconnected');
            };

            localStream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, localStream);
            });
            setupInputMeter(localStream);

            peerConnection.ontrack = (event) => {
                event.streams[0]?.getAudioTracks().forEach((track) => {
                    nextRemoteStream.addTrack(track);
                });
                if (nextRemoteStream.getAudioTracks().length === 0 && event.track.kind === 'audio') {
                    nextRemoteStream.addTrack(event.track);
                }
                remoteStreamRef.current = nextRemoteStream;
                setRemoteStream(nextRemoteStream);
            };

            peerConnection.onconnectionstatechange = () => {
                const nextState = peerConnection.connectionState;
                if (nextState === 'connected') {
                    setStatus((current) => (
                        ['connecting', 'connected', 'requesting_microphone'].includes(current)
                            ? 'listening'
                            : current
                    ));
                }
                if (nextState === 'failed' || nextState === 'closed' || nextState === 'disconnected') {
                    if (activeRef.current) setStatus(nextState);
                }
            };

            peerConnectionRef.current = peerConnection;
            localStreamRef.current = localStream;
            remoteStreamRef.current = nextRemoteStream;
            setStatus('connecting');

            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            await waitForIceGathering(peerConnection);

            const response = await fetch(apiUrl('/avatar/rtc/webrtc/offer'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sdp: peerConnection.localDescription?.sdp,
                    type: peerConnection.localDescription?.type,
                    webrtc_id: webrtcId,
                }),
            });

            if (!response.ok) throw new Error(`FastRTC offer returned ${response.status}`);
            const answer = await response.json();
            if (answer.status === 'failed') {
                throw new Error(answer.meta?.error || 'FastRTC rejected the WebRTC offer');
            }

            await peerConnection.setRemoteDescription(answer);
            setStatus('listening');
            return true;
        } catch (err) {
            stop();
            setStatus('error');
            setError(err.message || 'FastRTC voice connection failed');
            return false;
        }
    }, [health, refreshHealth, stop]);

    useEffect(() => {
        return () => stop();
    }, [stop]);

    const ready = Boolean(health?.enabled && health?.available && health?.mounted);

    return {
        active,
        status,
        health,
        ready,
        remoteStream,
        inputLevel,
        lastEvent,
        error,
        start,
        stop,
        refreshHealth,
    };
}
