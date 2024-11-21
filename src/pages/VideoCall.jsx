import React, { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '../config/firebase';
import {
    doc,
    getDoc,
    updateDoc,
    onSnapshot,
    setDoc,
    arrayUnion,
    serverTimestamp,
} from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import TranslationArea from '../components/TranslationArea';
import RemoteStreamAudioEquilizer from '../components/RemoteStreamAudioEquilizer';
import PeerConnection from 'peer-webrtc';

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
    const [connectionError, setConnectionError] = useState(null);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const peerRef = useRef(null);

    const getCallDocRef = useCallback(() => {
        if (!callDocId) {
            console.error('Call ID is missing');
            return null;
        }
        return doc(db, 'calls', callDocId);
    }, [callDocId]);

    const setupLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true,
            });

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            localStreamRef.current = stream;
            return stream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            setConnectionError('Could not access camera or microphone');
            return null;
        }
    }, []);

    const createPeerConnection = useCallback(async () => {
        try {
            const peer = new PeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ],
            });

            const localStream = localStreamRef.current;
            if (localStream) {
                localStream.getTracks().forEach((track) => {
                    peer.addTrack(track, localStream); // Use addTrack instead of addStream
                });
            }

            peer.on('signal', async (signalData) => {
                const docRef = getCallDocRef();
                if (!docRef) return;

                try {
                    if (signalData.type === 'offer') {
                        await setDoc(docRef, {
                            offer: signalData,
                            callerCandidates: [],
                            calleeCandidates: [],
                            createdAt: serverTimestamp(),
                        });
                    } else if (signalData.type === 'answer') {
                        await updateDoc(docRef, {
                            answer: signalData,
                            updatedAt: serverTimestamp(),
                        });
                    } else if (signalData.candidate) {
                        const candidateField = isCaller
                            ? 'callerCandidates'
                            : 'calleeCandidates';
                        await updateDoc(docRef, {
                            [candidateField]: arrayUnion(signalData),
                        });
                    }
                } catch (error) {
                    console.error('Error handling signaling data:', error);
                }
            });

            peer.on('track', (event) => {
                const stream = event.streams[0];
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = stream;
                }
                setRemoteStream(stream);

                const audioTracks = stream.getAudioTracks();
                if (audioTracks.length > 0) {
                    setAudioStream(new MediaStream(audioTracks));
                }
            });

            peer.on('connect', () => {
                setIsConnected(true);
            });

            peer.on('error', (error) => {
                console.error('Peer error:', error);
                setConnectionError(`Connection failed: ${error.message}`);
            });

            return peer;
        } catch (error) {
            console.error('Peer connection creation failed:', error);
            setConnectionError('Could not create peer connection');
            return null;
        }
    }, [getCallDocRef, isCaller]);

    const handleRemoteSignal = useCallback((signal) => {
        if (peerRef.current) {
            peerRef.current.signal(signal);
        }
    }, []);

    const toggleAudio = useCallback(() => {
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!audioTrack.enabled);
        }
    }, []);

    const toggleVideo = useCallback(() => {
        const videoTrack = localStreamRef.current?.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            setIsVideoOff(!videoTrack.enabled);
        }
    }, []);

    const endCall = useCallback(async () => {
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        if (peerRef.current) {
            peerRef.current.destroy();
        }

        const docRef = getCallDocRef();
        if (docRef) {
            await updateDoc(docRef, {
                status: 'ended',
                endedAt: serverTimestamp(),
            });
        }

        navigate('/');
    }, [getCallDocRef, navigate]);

    useEffect(() => {
        const initialize = async () => {
            await setupLocalStream();
            const peer = await createPeerConnection();
            if (peer) peerRef.current = peer;

            const docRef = getCallDocRef();
            if (docRef) {
                const unsubscribe = onSnapshot(docRef, (snapshot) => {
                    const data = snapshot.data();
                    if (!data) return;

                    if (data.status === 'ended') {
                        endCall();
                    }

                    if (isCaller && data.answer) handleRemoteSignal(data.answer);
                    else if (!isCaller && data.offer) handleRemoteSignal(data.offer);

                    const candidates = isCaller
                        ? data.calleeCandidates || []
                        : data.callerCandidates || [];
                    candidates.forEach((candidate) =>
                        peerRef.current?.signal(candidate)
                    );
                });

                return () => unsubscribe();
            }
        };

        initialize();
        return () => {
            localStreamRef.current?.getTracks().forEach((track) => track.stop());
            if (peerRef.current) {
                peerRef.current.destroy();
            }
        };
    }, [
        setupLocalStream,
        createPeerConnection,
        getCallDocRef,
        handleRemoteSignal,
        isCaller,
        endCall,
    ]);

    useEffect(() => {
        const fetchTranslationStatus = async () => {
            const docRef = getCallDocRef();
            if (!docRef) return;

            const docSnapshot = await getDoc(docRef);
            if (docSnapshot.exists()) {
                setIsTranslation(docSnapshot.data()?.translationEnabled || false);
            }
        };

        fetchTranslationStatus();
    }, [getCallDocRef]);

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 p-4">
            {connectionError && (
                <div
                    className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4"
                    role="alert"
                >
                    <strong className="font-bold">Connection Error: </strong>
                    <span className="block sm:inline">{connectionError}</span>
                </div>
            )}
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
                    className={`px-4 py-2 rounded-full ${
                        isMuted ? 'bg-red-500' : 'bg-blue-500'
                    } text-white`}
                >
                    {isMuted ? 'Unmute' : 'Mute'}
                </button>
                <button
                    onClick={toggleVideo}
                    className={`px-4 py-2 rounded-full ${
                        isVideoOff ? 'bg-red-500' : 'bg-blue-500'
                    } text-white`}
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
                <TranslationArea
                    callDocId={callDocId}
                    isCaller={isCaller}
                    remoteStream={remoteStream}
                    remoteAudioStream={audioStream}
                />
            ) : (
                <p>No Translation</p>
            )}
        </div>
    );
};

export default VideoCall;
