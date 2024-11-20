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

    const createOffer = useCallback(async () => {
        try {
            if (!peerConnectionRef.current || 
                !['stable', 'have-local-pranswer'].includes(peerConnectionRef.current.signalingState)) {
                console.log("Cannot create offer in current state:", 
                    peerConnectionRef.current?.signalingState);
                return;
            }

            console.log("Creating offer...");
            const offer = await peerConnectionRef.current.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            console.log("Setting local description...");
            await peerConnectionRef.current.setLocalDescription(offer);

            console.log("Updating offer in Firebase...");
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

    const initializePeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection(servers);
        setupTransceivers(pc);

        pc.ontrack = (event) => {
            console.log("ontrack event triggered", event);
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                console.log(`${isCaller ? 'Caller' : 'Callee'} received remote stream`, stream);
                
                setRemoteStream(stream);  // Set remote stream immediately

                // Handle audio stream
                const audioTracks = stream.getAudioTracks();
                if (audioTracks.length > 0) {
                    const audioOnlyStream = new MediaStream(audioTracks);
                    setAudioStream(audioOnlyStream);
                }
                // Ensure video element gets the stream
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = stream;
                    
                    // Add play handler for autoplay issues
                    remoteVideoRef.current.play().catch(error => {
                        console.warn("Autoplay failed:", error);
                    });
                }
            }
        };

       // Enhanced ICE candidate handling
       pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("New ICE candidate:", event.candidate);
            handleICECandidateEvent(event.candidate);
        }
    };

         // Add connection state change handler
         pc.onconnectionstatechange = () => {
            console.log("Connection State:", pc.connectionState);
            if (pc.connectionState === 'connected') {
                setIsConnected(true);
            } else if (pc.connectionState === 'failed') {
                console.error("Connection failed - attempting reconnect");
                // Implement reconnection logic if needed
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log("ICE Connection State:", pc.iceConnectionState);
            if (pc.iceConnectionState === 'connected') {
                setIsConnected(true);
            } else if (pc.iceConnectionState === 'failed') {
                console.error("ICE Connection failed");
            }
        };

        pc.onnegotiationneeded = async () => {
            console.log("Negotiation needed event triggered");
            if (isCaller && pc.signalingState === "stable") {
                try {
                    await createOffer();
                } catch (err) {
                    console.error("Error handling negotiationneeded:", err);
                }
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [servers, isCaller, createOffer, handleICECandidateEvent, setupTransceivers]);

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

            // Add tracks to peer connection
            if (peerConnectionRef.current) {
                stream.getTracks().forEach(track => {
                    console.log(`Adding ${track.kind} track to peer connection`);
                    const sender = peerConnectionRef.current.addTrack(track, stream);
                    console.log(`Added track sender:`, sender);
                });
            }
        } catch (error) {
            console.error("Error accessing media devices:", error);
            // Handle specific error cases
            if (error.name === 'NotAllowedError') {
                alert('Please allow camera and microphone access to use this app.');
            } else if (error.name === 'NotFoundError') {
                alert('No camera or microphone found. Please check your devices.');
            }
        }
    }, []);

    const handleOffer = useCallback(async (offer) => {
        try {
            if (!peerConnectionRef.current || 
                !['stable', 'have-remote-offer'].includes(peerConnectionRef.current.signalingState) ||
                hasCreatedAnswer.current) {
                console.log("Cannot handle offer in current state:", 
                    peerConnectionRef.current?.signalingState);
                return;
            }

            console.log("Setting remote description from offer...");
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            
            console.log("Creating answer...");
            const answer = await peerConnectionRef.current.createAnswer();
            
            console.log("Setting local description...");
            await peerConnectionRef.current.setLocalDescription(answer);

            hasCreatedAnswer.current = true;

            console.log("Updating answer in Firebase...");
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

    useEffect(() => {
        const pc = initializePeerConnection();
        if (pc) {
            setupLocalStream().then(() => {
                if (isCaller) {
                    setTimeout(() => {
                        createOffer();
                    }, 1000);
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

     // Add new useEffect for monitoring remote stream
     useEffect(() => {
        if (remoteStream) {
            console.log("Remote stream updated:", remoteStream);
            
            // Monitor track changes
            remoteStream.onaddtrack = (event) => {
                console.log("Track added to remote stream:", event.track);
            };
            
            remoteStream.onremovetrack = (event) => {
                console.log("Track removed from remote stream:", event.track);
            };
        }
    }, [remoteStream]);

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
                        muted
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