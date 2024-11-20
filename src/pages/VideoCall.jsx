import React, { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import TranslationArea from '../components/TranslationArea';
import RemoteStreamAudioEquilizer from '../components/RemoteStreamAudioEquilizer';

const VideoCall = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const callDocId = location.state?.callId || "";
    const isCaller = location.state?.isCaller || false;

    const [isTranslation, setIsTranslation] = useState(false);
    const [remoteStream, setRemoteStream] = useState(null);
    const [audioStream, setAudioStream] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    // Refs
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const hasSetRemoteAnswer = useRef(false);
    const hasCreatedAnswer = useRef(false);

    const callDocRef = useRef(doc(db, "calls", callDocId));

    const servers = {
        iceServers: [
            {
                urls: [
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302'
                ]
            }
        ]
    };

    const createPeerConnection = useCallback(() => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }

        const pc = new RTCPeerConnection(servers);

        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                setRemoteStream(stream);

                if (stream.getAudioTracks().length > 0) {
                    const audioOnlyStream = new MediaStream(stream.getAudioTracks());
                    setAudioStream(audioOnlyStream);
                }

                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = stream;
                }
            }
        };

        pc.onicecandidate = async (event) => {
            if (!event.candidate) return;

            const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
            try {
                const docSnapshot = await getDoc(callDocRef.current);
                const data = docSnapshot.data() || {};
                const candidates = data[field] || [];
                
                await updateDoc(callDocRef.current, {
                    [field]: [...candidates, event.candidate.toJSON()]
                });
            } catch (error) {
                console.error("Error handling ICE candidate:", error);
            }
        };

        pc.onconnectionstatechange = () => {
            setIsConnected(pc.connectionState === 'connected');
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [isCaller, servers]);

    const setupLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });

            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            if (peerConnectionRef.current && peerConnectionRef.current.connectionState !== 'closed') {
                stream.getTracks().forEach(track => {
                    peerConnectionRef.current.addTrack(track, stream);
                });

                if (isCaller) {
                    const offer = await peerConnectionRef.current.createOffer();
                    await peerConnectionRef.current.setLocalDescription(offer);
                    
                    await updateDoc(callDocRef.current, {
                        offer: {
                            type: offer.type,
                            sdp: offer.sdp
                        }
                    });
                }
            }
        } catch (error) {
            console.error("Error accessing media devices:", error);
            alert('Error accessing camera/microphone. Please check permissions.');
        }
    }, [isCaller]);

    const handleOffer = useCallback(async (offer) => {
        if (!peerConnectionRef.current || hasCreatedAnswer.current) return;

        try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);

            hasCreatedAnswer.current = true;
            await updateDoc(callDocRef.current, {
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                }
            });
        } catch (error) {
            console.error("Error handling offer:", error);
        }
    }, []);

    const handleAnswer = useCallback(async (answer) => {
        if (!peerConnectionRef.current || hasSetRemoteAnswer.current) return;

        try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            hasSetRemoteAnswer.current = true;
        } catch (error) {
            console.error("Error handling answer:", error);
        }
    }, []);

    const handleICECandidates = useCallback(async (candidates) => {
        if (!peerConnectionRef.current || !candidates?.length) return;

        for (const candidate of candidates) {
            try {
                if (peerConnectionRef.current.remoteDescription) {
                    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                }
            } catch (error) {
                console.warn("Failed to add ICE candidate:", error);
            }
        }
    }, []);

    const cleanup = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        setRemoteStream(null);
        setAudioStream(null);
        setIsConnected(false);
        hasCreatedAnswer.current = false;
        hasSetRemoteAnswer.current = false;
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
        try {
            await updateDoc(callDocRef.current, {
                status: 'ended',
                endedAt: new Date().toISOString()
            });
            cleanup();
            navigate('/');
        } catch (error) {
            console.error("Error ending call:", error);
        }
    }, [cleanup, navigate]);

    // Initialize connection
    useEffect(() => {
        let unsubscribe;

        const initializeCall = async () => {
            createPeerConnection();
            await setupLocalStream();

            unsubscribe = onSnapshot(callDocRef.current, async (snapshot) => {
                const data = snapshot.data();
                if (!data) return;

                try {
                    if (!isCaller && data.offer && !hasCreatedAnswer.current) {
                        await handleOffer(data.offer);
                    }

                    if (isCaller && data.answer && !hasSetRemoteAnswer.current) {
                        await handleAnswer(data.answer);
                    }

                    const candidates = isCaller ? data.calleeCandidates : data.callerCandidates;
                    if (candidates?.length) {
                        await handleICECandidates(candidates);
                    }

                    if (data.status === 'ended') {
                        cleanup();
                        navigate('/');
                    }
                } catch (error) {
                    console.error("Error in call setup:", error);
                }
            });
        };

        initializeCall();

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
            cleanup();
        };
    }, [
        createPeerConnection,
        setupLocalStream,
        isCaller,
        handleOffer,
        handleAnswer,
        handleICECandidates,
        cleanup,
        navigate
    ]);

    // Check translation status
    useEffect(() => {
        const checkTranslation = async () => {
            try {
                const docSnapshot = await getDoc(callDocRef.current);
                if (docSnapshot.exists()) {
                    setIsTranslation(docSnapshot.data().translationEnabled);
                }
            } catch (error) {
                console.error("Error checking translation status:", error);
            }
        };

        checkTranslation();
    }, []);

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 p-4">
            <div className="grid grid-cols-2 gap-4 mb-4 w-full max-w-4xl mx-auto">
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

            {remoteStream && <RemoteStreamAudioEquilizer audioStream={audioStream} />}

            <div className="flex gap-4 mt-4 justify-center">
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

            {isTranslation && remoteStream && (
                <TranslationArea 
                    callDocId={callDocId} 
                    isCaller={isCaller} 
                    remoteStream={remoteStream} 
                    remoteAudioStream={audioStream} 
                />
            )}
        </div>
    );
};

export default VideoCall;