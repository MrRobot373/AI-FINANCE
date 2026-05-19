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

    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const remoteStreamRef = useRef(null);
    const activeRef = useRef(false);

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

        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;

        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;

        remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
        remoteStreamRef.current = null;
        setRemoteStream(null);
    }, []);

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

        try {
            setStatus('connecting');
            const localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            const peerConnection = new RTCPeerConnection();
            const nextRemoteStream = new MediaStream();
            const webrtcId = createWebRtcId();

            localStream.getTracks().forEach((track) => {
                peerConnection.addTrack(track, localStream);
            });

            peerConnection.ontrack = (event) => {
                event.streams[0]?.getAudioTracks().forEach((track) => {
                    nextRemoteStream.addTrack(track);
                });
                if (nextRemoteStream.getAudioTracks().length === 0 && event.track.kind === 'audio') {
                    nextRemoteStream.addTrack(event.track);
                }
                remoteStreamRef.current = nextRemoteStream;
                setRemoteStream(nextRemoteStream);
                setStatus('speaking');
            };

            peerConnection.onconnectionstatechange = () => {
                const nextState = peerConnection.connectionState;
                if (nextState === 'connected') setStatus('connected');
                if (nextState === 'failed' || nextState === 'closed' || nextState === 'disconnected') {
                    if (activeRef.current) setStatus(nextState);
                }
            };

            peerConnectionRef.current = peerConnection;
            localStreamRef.current = localStream;
            remoteStreamRef.current = nextRemoteStream;
            activeRef.current = true;
            setActive(true);

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
        error,
        start,
        stop,
        refreshHealth,
    };
}
