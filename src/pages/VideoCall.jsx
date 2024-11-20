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

    // Refs
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const hasSetRemoteAnswer = useRef(false);
    const hasCreatedAnswer = useRef(false);

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
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: 'sendrecv' });
    }, []);

    const initializePeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection(servers);
        setupTransceivers(pc);

        pc.ontrack = (event) => {
            console.log("ontrack event triggered", event);
            if (remoteVideoRef.current && event.streams[0]) {
                const stream = event.streams[0];
                console.log("Setting remote stream", stream);
                remoteVideoRef.current.srcObject = stream;
                setRemoteStream(stream);

                const audioTracks = stream.getAudioTracks();
                if (audioTracks.length > 0) {
                    const audioOnlyStream = new MediaStream(audioTracks);
                    setAudioStream(audioOnlyStream);
                }
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                handleICECandidateEvent(event.candidate);
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log("ICE Connection State:", pc.iceConnectionState);
            if (pc.iceConnectionState === 'connected') {
                setIsConnected(true);
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [servers, setupTransceivers]);

    const handleICECandidateEvent = useCallback(async (candidate) => {
        try {
            const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
            const docSnapshot = await getDoc(callDocRef);
            const docData = docSnapshot.data() || {};
            const currentCandidates = docData[field] || [];
            
            // Check if this candidate already exists
            const candidateJson = candidate.toJSON();
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

            stream.getTracks().forEach(track => {
                if (peerConnectionRef.current) {
                    peerConnectionRef.current.addTrack(track, stream);
                }
            });
        } catch (error) {
            console.error("Error accessing media devices:", error);
        }
    }, []);

    const createOffer = useCallback(async () => {
        try {
            if (!peerConnectionRef.current || 
                !['stable', 'have-local-pranswer'].includes(peerConnectionRef.current.signalingState)) {
                return;
            }

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

    const handleOffer = useCallback(async (offer) => {
        try {
            if (!peerConnectionRef.current || 
                !['stable', 'have-remote-offer'].includes(peerConnectionRef.current.signalingState) ||
                hasCreatedAnswer.current) {
                return;
            }

            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);

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
    }, [callDocRef]);

    const handleAnswer = useCallback(async (answer) => {
        try {
            if (!peerConnectionRef.current || 
                peerConnectionRef.current.signalingState !== "have-local-offer" ||
                hasSetRemoteAnswer.current) {
                return;
            }

            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            hasSetRemoteAnswer.current = true;
            setIsConnected(true);
        } catch (error) {
            console.error("Error handling answer:", error);
        }
    }, []);

    const handleRemoteICECandidates = useCallback(async (candidates) => {
        if (!peerConnectionRef.current || !candidates?.length) return;

        const pc = peerConnectionRef.current;
        
        for (const candidate of candidates) {
            try {
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
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
    }, [callDocRef, navigate]);

    const cleanup = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }
        setIsConnected(false);
        hasCreatedAnswer.current = false;
        hasSetRemoteAnswer.current = false;
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

    useEffect(() => {
        const getIsTranslation = async () => {
            try {
                const docSnapshot = await getDoc(callDocRef);
                if (docSnapshot.exists()) {
                    const data = docSnapshot.data();
                    setIsTranslation(data.translationEnabled);
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