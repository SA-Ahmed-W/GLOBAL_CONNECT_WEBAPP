import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
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

    const setupTransceivers = useCallback((pc) => {
        // Add transceivers in a specific order (audio first, then video)
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: 'sendrecv' });
    }, []);

    const initializePeerConnection = useCallback(() => {
        try {
            const pc = new RTCPeerConnection(servers);
            
            // Set up transceivers first
            setupTransceivers(pc);

            pc.ontrack = (event) => {
                console.log("Received remote track", event.track.kind);
                if (remoteVideoRef.current && event.streams[0]) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                }
            };

            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    handleICECandidateEvent(event.candidate);
                }
            };

            pc.oniceconnectionstatechange = () => {
                console.log("ICE Connection State:", pc.iceConnectionState);
            };

            peerConnectionRef.current = pc;
            return pc;
        } catch (error) {
            console.error("Error initializing peer connection:", error);
            return null;
        }
    }, [servers, setupTransceivers]);

    const handleICECandidateEvent = useCallback(async (candidate) => {
        try {
            const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
            await updateDoc(callDocRef, {
                [field]: [...(await getDoc(callDocRef)).data()?.[field] || [], candidate.toJSON()]
            });
        } catch (error) {
            console.error("Error handling ICE candidate:", error);
        }
    }, [isCaller, callDocRef]);

    const setupLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });
            
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            
            localStreamRef.current = stream;

            if (peerConnectionRef.current) {
                const audioTrack = stream.getAudioTracks()[0];
                const videoTrack = stream.getVideoTracks()[0];

                if (audioTrack) {
                    const audioSender = peerConnectionRef.current.getSenders()
                        .find(s => s.track?.kind === 'audio');
                    if (audioSender) {
                        await audioSender.replaceTrack(audioTrack);
                    }
                }

                if (videoTrack) {
                    const videoSender = peerConnectionRef.current.getSenders()
                        .find(s => s.track?.kind === 'video');
                    if (videoSender) {
                        await videoSender.replaceTrack(videoTrack);
                    }
                }
            }
        } catch (error) {
            console.error("Error accessing media devices:", error);
        }
    }, []);

    const createOffer = useCallback(async () => {
        try {
            if (!peerConnectionRef.current) return;

            const offer = await peerConnectionRef.current.createOffer();
            console.log("Created offer:", offer.sdp);
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

    const handleOffer = useCallback(async (offer) => {
        try {
            if (!peerConnectionRef.current) return;
            console.log("Handling offer:", offer.sdp);

            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnectionRef.current.createAnswer();
            console.log("Created answer:", answer.sdp);
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

    const handleAnswer = useCallback(async (answer) => {
        try {
            if (!peerConnectionRef.current) return;
            console.log("Handling answer:", answer.sdp);

            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            setIsConnected(true);
        } catch (error) {
            console.error("Error handling answer:", error);
        }
    }, []);

    const handleRemoteICECandidates = useCallback(async (candidates) => {
        if (!peerConnectionRef.current || !candidates?.length) return;

        for (const candidate of candidates) {
            try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.warn("Failed to add ICE candidate:", error);
            }
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
        try {
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
            }
            
            await updateDoc(callDocRef, {
                status: 'ended',
                endedAt: new Date().toISOString()
            });

            navigate('/');
        } catch (error) {
            console.error("Error ending call:", error);
            // Still try to navigate away even if there's an error
            navigate('/');
        }
    }, [callDocRef, navigate]);

    const cleanup = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }
        setIsConnected(false);
    }, []);

    useEffect(() => {
        const pc = initializePeerConnection();
        if (pc) {
            setupLocalStream().then(() => {
                if (isCaller) {
                    createOffer();
                }
            });
        }

        return cleanup;
    }, [initializePeerConnection, setupLocalStream, createOffer, cleanup, isCaller]);

    useEffect(() => {
        const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            try {
                if (!isCaller && data.offer && !peerConnectionRef.current?.remoteDescription) {
                    await handleOffer(data.offer);
                }

                if (isCaller && data.answer && !peerConnectionRef.current?.remoteDescription) {
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