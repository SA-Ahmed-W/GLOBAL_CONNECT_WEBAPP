import React, { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import TranslationArea from '../components/TranslationArea';
import RemoteStreamAudioEquilizer from '../components/RemoteStreamAudioEquilizer';
import Peer from 'simple-peer'; // Ensure this is installed

const VideoCall = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const callDocId = location.state?.callId || '';
    const isCaller = location.state?.isCaller || false;

    const [isTranslation, setIsTranslation] = useState(false);
    const [remoteStream, setRemoteStream] = useState(null);
    const [audioStream, setAudioStream] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const peerRef = useRef(null);

    const callDocRef = useCallback(() => {
        if (!callDocId) {
            console.error('Call ID is missing');
            return null;
        }
        return doc(db, 'calls', callDocId);
    }, [callDocId]);

    const setupLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            localVideoRef.current.srcObject = stream;
            localStreamRef.current = stream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
        }
    }, []);

    const createPeerConnection = useCallback(() => {
        if (!localStreamRef.current) {
            console.error('Local stream not initialized');
            return;
        }

        const peer = new Peer({
            initiator: isCaller,
            trickle: false,
            stream: localStreamRef.current,
        });

        peer.on('signal', async (data) => {
            const docRef = callDocRef();
            if (!docRef) return;

            const field = isCaller ? 'offer' : 'answer';
            try {
                await updateDoc(docRef, { [field]: data });
            } catch (error) {
                console.error(`Error updating ${field} in Firestore:`, error);
            }
        });

        peer.on('connect', () => {
            console.log('Peer connection established');
            setIsConnected(true);
        });

        peer.on('stream', (stream) => {
            setRemoteStream(stream);
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
                setAudioStream(new MediaStream(audioTracks));
            }
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
            }
        });

        peer.on('close', () => {
            console.log('Peer connection closed');
            setIsConnected(false);
        });

        peer.on('error', (err) => {
            console.error('Peer connection error:', err);
        });

        peerRef.current = peer;
    }, [isCaller, callDocRef]);

    const handleRemoteSignal = useCallback(async (signal) => {
        if (!peerRef.current) {
            console.error('Peer connection not initialized');
            return;
        }
        try {
            peerRef.current.signal(signal);
        } catch (error) {
            console.error('Error handling remote signal:', error);
        }
    }, []);

    const toggleAudio = useCallback(() => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    }, []);

    const toggleVideo = useCallback(() => {
        if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoOff(!videoTrack.enabled);
            }
        }
    }, []);

    const endCall = useCallback(async () => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        if (peerRef.current) {
            peerRef.current.destroy();
        }
        const docRef = callDocRef();
        if (docRef) {
            await updateDoc(docRef, { status: 'ended', endedAt: new Date().toISOString() });
        }
        navigate('/');
    }, [callDocRef, navigate]);

    useEffect(() => {
        setupLocalStream();
        createPeerConnection();

        const docRef = callDocRef();
        if (!docRef) return;

        const unsubscribe = onSnapshot(docRef, async (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            console.log('Firestore update:', data);

            if (isCaller && data.answer) {
                await handleRemoteSignal(data.answer);
            } else if (!isCaller && data.offer) {
                await handleRemoteSignal(data.offer);
            }

            if (data.status === 'ended') {
                endCall();
            }
        });

        return () => {
            unsubscribe();
            if (peerRef.current) {
                peerRef.current.destroy();
            }
        };
    }, [setupLocalStream, createPeerConnection, callDocRef, handleRemoteSignal, isCaller, endCall]);

    useEffect(() => {
        const fetchTranslationStatus = async () => {
            const docRef = callDocRef();
            if (!docRef) return;

            const docSnapshot = await getDoc(docRef);
            if (docSnapshot.exists()) {
                setIsTranslation(docSnapshot.data()?.translationEnabled || false);
            }
        };

        fetchTranslationStatus();
    }, [callDocRef]);

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 p-4">
            <div className="grid grid-cols-2 gap-4 mb-4 w-full max-w-4xl">
                <div className="relative">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full rounded-lg shadow-lg"
                    />
                    <p className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">
                        You
                    </p>
                </div>
                <div className="relative">
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full rounded-lg shadow-lg"
                    />
                    <p className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">
                        Remote User
                    </p>
                </div>
            </div>
            <RemoteStreamAudioEquilizer audioStream={audioStream} />
            <div className="flex gap-4 mt-4">
                <button
                    onClick={toggleAudio}
                    className={`px-4 py-2 rounded-full ${isMuted ? 'bg-red-500' : 'bg-blue-500'} text-white`}
                >
                    {isMuted ? 'Unmute' : 'Mute'}
                </button>
                <button
                    onClick={toggleVideo}
                    className={`px-4 py-2 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-blue-500'} text-white`}
                >
                    {isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
                </button>
                <button
                    onClick={endCall}
                    className="px-4 py-2 rounded-full bg-red-500 text-white"
                >
                    End Call
                </button>
            </div>
            {isTranslation ? (
                <TranslationArea callDocId={callDocId} isCaller={isCaller} remoteStream={remoteStream} remoteAudioStream={audioStream} />
            ) : (
                <p>No Translation</p>
            )}
        </div>
    );
};

export default VideoCall;
