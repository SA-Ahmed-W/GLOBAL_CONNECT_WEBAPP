import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import TranslationArea from '../components/TranslationArea';

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
            if (remoteVideoRef.current && event.streams[0]) {
                const stream = event.streams[0];
                remoteVideoRef.current.srcObject = stream
        
                // Set the full remote stream
                setRemoteStream(stream);
        
                // Extract only the audio track and create an audio-only stream
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
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [servers, setupTransceivers]);

    const handleICECandidateEvent = useCallback(async (candidate) => {
        try {
            const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
            const docData = (await getDoc(callDocRef)).data();
            await updateDoc(callDocRef, {
                [field]: [...(docData?.[field] || []), candidate.toJSON()]
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

            localVideoRef.current.srcObject = stream;
            localStreamRef.current = stream;

            stream.getTracks().forEach(track => {
                peerConnectionRef.current.addTrack(track, stream);
            });
        } catch (error) {
            console.error("Error accessing media devices:", error);
        }
    }, []);

    const createOffer = useCallback(async () => {
        try {
            if (!peerConnectionRef.current || peerConnectionRef.current.signalingState !== "stable") return;

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
            if (!peerConnectionRef.current || peerConnectionRef.current.signalingState !== "stable") return;

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

    const handleAnswer = useCallback(async (answer) => {
        try {
            if (!peerConnectionRef.current || peerConnectionRef.current.signalingState !== "have-local-offer") return;

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

        // await deleteDoc(callDocRef);

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
                if (!isCaller && data.offer && peerConnectionRef.current.signalingState === "stable") {
                    await handleOffer(data.offer);
                }

                if (isCaller && data.answer && peerConnectionRef.current.signalingState === "have-local-offer") {
                    await handleAnswer(data.answer);
                }

                const candidates = isCaller ? data.calleeCandidates : data.callerCandidates;
                if (candidates?.length) {
                    await handleRemoteICECandidates(candidates);
                }

                if (data.status === 'ended') {
                    cleanup();
                    // await deleteDoc(callDocRef);
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
                // Fetch the document from Firestore
                const docSnapshot = await getDoc(callDocRef);

                // Check if the document exists and get the 'translationEnabled' field
                if (docSnapshot.exists()) {
                    const data = docSnapshot.data();
                    const translationEnabled = data.translationEnabled;

                    // Set the state with the fetched value
                    setIsTranslation(translationEnabled);
                } else {
                    console.log("Document does not exist");
                }
            } catch (error) {
                console.error("Error fetching document: ", error);
            }
        };

        getIsTranslation();
    }, []);

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

            {/* Pass remoteStream as a prop */}
            {isTranslation ? (
                <TranslationArea callDocId={callDocId} isCaller={isCaller} remoteStream={remoteStream} remoteAudioStream={audioStream} />
            ) : (
                <p>NO TRANSLATION</p>
            )}
        </div>
    );
};

export default VideoCall;
