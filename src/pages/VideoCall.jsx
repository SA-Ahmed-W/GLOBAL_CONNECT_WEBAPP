import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc, setDoc, onSnapshot,arrayUnion } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';

const VideoCall = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const callDocId = location.state?.callId || "";
    const isCaller = location.state?.isCaller || false;

    // Refs
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);

    // State
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    // Memoized values
    const servers = useMemo(() => ({
        iceServers: [
            {
                urls: [
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302'
                ]
            }
        ]
    }), []);

    const callDocRef = useMemo(() => doc(db, "calls", callDocId), [callDocId]);

    // Initialize WebRTC peer connection
    const initializePeerConnection = useCallback(() => {
        const peerConnection = new RTCPeerConnection(servers);
        
        peerConnection.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                handleICECandidateEvent(event.candidate);
            }
        };

        peerConnectionRef.current = peerConnection;
        return peerConnection;
    }, [servers]);

    // Handle ICE candidate events
    const handleICECandidateEvent = useCallback(async (candidate) => {
        try {
            const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
            await updateDoc(callDocRef, {
                [field]: arrayUnion(candidate.toJSON())
            });
        } catch (error) {
            console.error("Error handling ICE candidate:", error);
        }
    }, [isCaller, callDocRef]);

    // Setup local media stream
    const setupLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            
            localStreamRef.current = stream;
            stream.getTracks().forEach(track => {
                peerConnectionRef.current?.addTrack(track, stream);
            });
        } catch (error) {
            console.error("Error accessing media devices:", error);
        }
    }, []);

    // Create and send offer (caller)
    const createOffer = useCallback(async () => {
        try {
            const offer = await peerConnectionRef.current.createOffer();
            await peerConnectionRef.current.setLocalDescription(offer);
            
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

    // Handle incoming offer (callee)
    const handleOffer = useCallback(async (offer) => {
        try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            
            await updateDoc(callDocRef, {
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                }
            });
        } catch (error) {
            console.error("Error handling offer:", error);
        }
    }, [callDocRef]);

    // Handle incoming answer (caller)
    const handleAnswer = useCallback(async (answer) => {
        try {
            const rtcAnswer = new RTCSessionDescription(answer);
            await peerConnectionRef.current.setRemoteDescription(rtcAnswer);
        } catch (error) {
            console.error("Error handling answer:", error);
        }
    }, []);

    // Handle remote ICE candidates
    const handleRemoteICECandidates = useCallback(async (candidates) => {
        try {
            candidates.forEach(async (candidate) => {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            });
        } catch (error) {
            console.error("Error handling remote ICE candidates:", error);
        }
    }, []);

    // Toggle audio
    const toggleAudio = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsMuted(!isMuted);
        }
    }, [isMuted]);

    // Toggle video
    const toggleVideo = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach(track => {
                track.enabled = !track.enabled;
            });
            setIsVideoOff(!isVideoOff);
        }
    }, [isVideoOff]);

    // End call
    const endCall = useCallback(async () => {
        try {
            // Stop all tracks
            localStreamRef.current?.getTracks().forEach(track => track.stop());
            
            // Close peer connection
            peerConnectionRef.current?.close();
            
            // Update call status in Firestore
            await updateDoc(callDocRef, {
                status: 'ended',
                endedAt: new Date().toISOString()
            });

            // Navigate back
            navigate('/'); // Or wherever you want to redirect after call ends
        } catch (error) {
            console.error("Error ending call:", error);
        }
    }, [callDocRef, navigate]);

    // Cleanup function
    const cleanup = useCallback(() => {
        localStreamRef.current?.getTracks().forEach(track => track.stop());
        peerConnectionRef.current?.close();
        setIsConnected(false);
    }, []);

    // Main setup effect
    useEffect(() => {
        const setup = async () => {
            initializePeerConnection();
            await setupLocalStream();

            if (isCaller) {
                await createOffer();
            }
        };

        setup();

        return cleanup;
    }, [initializePeerConnection, setupLocalStream, createOffer, cleanup, isCaller]);

    // Listen for remote changes
    useEffect(() => {
        const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            if (!isCaller && data.offer && !peerConnectionRef.current?.currentRemoteDescription) {
                await handleOffer(data.offer);
            }

            if (isCaller && data.answer && !peerConnectionRef.current?.currentRemoteDescription) {
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
        });

        return () => {
            unsubscribe();
            cleanup();
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

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
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
        </div>
    );
};

export default VideoCall;