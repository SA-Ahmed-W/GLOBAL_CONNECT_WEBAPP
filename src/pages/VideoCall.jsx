import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
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
    const [peerConnection, setPeerConnection] = useState(null);

    // Refs
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const hasSetRemoteAnswer = useRef(false);
    const hasCreatedAnswer = useRef(false);

    // State
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

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

    const callDocRef = useMemo(() => doc(db, "calls", callDocId), [callDocId]);

    const handleICECandidateEvent = useCallback(async (event) => {
        if (!event.candidate) return;

        try {
            const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
            const docSnapshot = await getDoc(callDocRef);
            const docData = docSnapshot.data() || {};
            const currentCandidates = docData[field] || [];
            
            const candidateJson = event.candidate.toJSON();
            const candidateExists = currentCandidates.some(
                c => c.candidate === candidateJson.candidate
            );

            if (!candidateExists) {
                await updateDoc(callDocRef, {
                    [field]: [...currentCandidates, candidateJson]
                });
            }
        } catch (error) {
            console.error("Error handling ICE candidate:", error);
        }
    }, [isCaller, callDocRef]);

    const initializePeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection(servers);

        // Add transceivers
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: 'sendrecv' });

        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                console.log("Received remote stream", stream);
                
                setRemoteStream(stream);

                // Handle audio stream
                const audioTracks = stream.getAudioTracks();
                if (audioTracks.length > 0) {
                    const audioOnlyStream = new MediaStream(audioTracks);
                    setAudioStream(audioOnlyStream);
                }

                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = stream;
                }
            }
        };

        pc.onicecandidate = handleICECandidateEvent;

        pc.onconnectionstatechange = () => {
            console.log("Connection state:", pc.connectionState);
            setIsConnected(pc.connectionState === 'connected');
        };

        pc.oniceconnectionstatechange = () => {
            console.log("ICE Connection state:", pc.iceConnectionState);
            setIsConnected(pc.iceConnectionState === 'connected');
        };

        setPeerConnection(pc);
        return pc;
    }, [servers, handleICECandidateEvent]);

    const createOffer = useCallback(async (pc) => {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            await updateDoc(callDocRef, {
                offer: {
                    type: offer.type,
                    sdp: offer.sdp
                }
            });
        } catch (error) {
            console.error("Error creating offer:", error);
        }
    }, [callDocRef]);

    const setupLocalStream = useCallback(async (pc) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });

            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            // If caller, create offer after adding tracks
            if (isCaller) {
                await createOffer(pc);
            }
        } catch (error) {
            console.error("Error accessing media devices:", error);
            if (error.name === 'NotAllowedError') {
                alert('Please allow camera and microphone access.');
            } else if (error.name === 'NotFoundError') {
                alert('No camera or microphone found.');
            }
        }
    }, [isCaller, createOffer]);

    const handleOffer = useCallback(async (offer) => {
        if (!peerConnection || hasCreatedAnswer.current) return;

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            hasCreatedAnswer.current = true;

            await updateDoc(callDocRef, {
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                }
            });
        } catch (error) {
            console.error("Error handling offer:", error);
        }
    }, [peerConnection, callDocRef]);

    const handleAnswer = useCallback(async (answer) => {
        if (!peerConnection || hasSetRemoteAnswer.current) return;

        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            hasSetRemoteAnswer.current = true;
        } catch (error) {
            console.error("Error handling answer:", error);
        }
    }, [peerConnection]);

    const handleRemoteICECandidates = useCallback(async (candidates) => {
        if (!peerConnection || !candidates?.length) return;

        for (const candidate of candidates) {
            try {
                if (peerConnection.remoteDescription) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                }
            } catch (error) {
                console.warn("Failed to add ICE candidate:", error);
            }
        }
    }, [peerConnection]);

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

    const cleanup = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (peerConnection) {
            peerConnection.close();
        }
        setIsConnected(false);
        hasCreatedAnswer.current = false;
        hasSetRemoteAnswer.current = false;
    }, [peerConnection]);

    const endCall = useCallback(async () => {
        cleanup();
        await updateDoc(callDocRef, {
            status: 'ended',
            endedAt: new Date().toISOString()
        });
        navigate('/');
    }, [callDocRef, navigate, cleanup]);

    // Initialize peer connection and local stream
    useEffect(() => {
        const pc = initializePeerConnection();
        setupLocalStream(pc);

        return () => {
            cleanup();
        };
    }, [initializePeerConnection, setupLocalStream, cleanup]);

    // Handle signaling
    useEffect(() => {
        const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
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
                    await handleRemoteICECandidates(candidates);
                }

                if (data.status === 'ended') {
                    cleanup();
                    navigate('/');
                }
            } catch (error) {
                console.error("Error in Firestore snapshot listener:", error);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [
        callDocRef,
        isCaller,
        handleOffer,
        handleAnswer,
        handleRemoteICECandidates,
        cleanup,
        navigate
    ]);

    // Check translation status
    useEffect(() => {
        const getIsTranslation = async () => {
            try {
                const docSnapshot = await getDoc(callDocRef);
                if (docSnapshot.exists()) {
                    setIsTranslation(docSnapshot.data().translationEnabled);
                }
            } catch (error) {
                console.error("Error fetching translation status:", error);
            }
        };

        getIsTranslation();
    }, [callDocRef]);

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