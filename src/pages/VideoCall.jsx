import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import TranslationArea from '../components/TranslationArea';
import RemoteStreamAudioEquilizer from '../components/RemoteStreamAudioEquilizer';

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
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);
    const signalingStateRef = useRef('new');

    const servers = useMemo(() => ({
        iceServers: [
            { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        ],
    }), []);

    const callDocRef = useMemo(() => doc(db, 'calls', callDocId), [callDocId]);

    const setupTransceivers = useCallback((pc) => {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: 'sendrecv' });
    }, []);

    const initializePeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection(servers);
        setupTransceivers(pc);

        pc.ontrack = (event) => {
            if (event.streams[0]) {
                setRemoteStream(event.streams[0]);
                const audioTracks = event.streams[0].getAudioTracks();
                if (audioTracks.length > 0) {
                    const audioOnlyStream = new MediaStream(audioTracks);
                    setAudioStream(audioOnlyStream);
                }
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                }
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                handleICECandidateEvent(event.candidate);
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', pc.iceConnectionState);
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [servers, setupTransceivers]);

    const handleICECandidateEvent = useCallback(async (candidate) => {
        const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
        const docData = (await getDoc(callDocRef)).data();
        await updateDoc(callDocRef, {
            [field]: [...(docData?.[field] || []), candidate.toJSON()],
        });
    }, [isCaller, callDocRef]);

    const setupLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            localVideoRef.current.srcObject = stream;
            localStreamRef.current = stream;

            stream.getTracks().forEach((track) => {
                peerConnectionRef.current.addTrack(track, stream);
            });
        } catch (error) {
            console.error('Error accessing media devices:', error);
        }
    }, []);

    const createOffer = useCallback(async () => {
        const pc = peerConnectionRef.current;
        if (!pc || pc.signalingState !== 'stable') return;

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            signalingStateRef.current = 'have-local-offer';

            await updateDoc(callDocRef, { 
                offer: { type: offer.type, sdp: offer.sdp },
                offerCreatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }, [callDocRef]);

    const handleOffer = useCallback(async (offer, offerCreatedAt) => {
        const pc = peerConnectionRef.current;
        if (!pc || pc.signalingState !== 'stable' || signalingStateRef.current !== 'new') return;

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            signalingStateRef.current = 'have-remote-offer';
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signalingStateRef.current = 'have-local-answer';

            await updateDoc(callDocRef, { 
                answer: { type: answer.type, sdp: answer.sdp },
                answerCreatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }, [callDocRef]);

    const handleAnswer = useCallback(async (answer, answerCreatedAt) => {
        const pc = peerConnectionRef.current;
        if (!pc || pc.signalingState !== 'have-local-offer' || signalingStateRef.current !== 'have-local-offer') return;

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            signalingStateRef.current = 'stable';
            setIsConnected(true);
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }, []);

    const handleRemoteICECandidates = useCallback(async (candidates) => {
        if (!peerConnectionRef.current || !candidates?.length) return;
        for (const candidate of candidates) {
            try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.warn('Failed to add ICE candidate:', error);
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
            localStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }

        await updateDoc(callDocRef, { status: 'ended', endedAt: new Date().toISOString() });
        const userDocref = doc(db,"users",auth.currentUser.uid)
        await updateDoc(userDocref, { status: 'online' });
        navigate('/');
    }, [callDocRef, navigate]);

    const cleanup = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }
        setIsConnected(false);
    }, []);

    useEffect(() => {
        const pc = initializePeerConnection();
        setupLocalStream().then(() => {
            if (isCaller) createOffer();
        });
        return cleanup;
    }, [initializePeerConnection, setupLocalStream, createOffer, cleanup, isCaller]);

    useEffect(() => {
        const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            try {
                if (!isCaller && data.offer && peerConnectionRef.current && signalingStateRef.current === 'new') {
                    await handleOffer(data.offer, data.offerCreatedAt);
                }

                if (isCaller && data.answer && signalingStateRef.current === 'have-local-offer') {
                    await handleAnswer(data.answer, data.answerCreatedAt);
                }

                const candidates = isCaller ? data.calleeCandidates : data.callerCandidates;
                if (candidates?.length) {
                    await handleRemoteICECandidates(candidates);
                }

                if (data.status === 'ended') {
                    cleanup();
                    
                    try {
                        // Get the call document data
                        const docSnapshot = await getDoc(callDocRef);
                        if (docSnapshot.exists()) {
                            const callData = docSnapshot.data();
                            
                            // Get the receiverId from the call document (assuming it's stored as receiverId or calleeId)
                            const receiverId = isCaller ? callData.receiverId : callData.callerId;
                            
                            // Update the receiver's status to "online" in the users collection
                            if (receiverId) {
                                const userRef = doc(db, "users", receiverId);
                                await updateDoc(userRef, {
                                    status: "online"
                                });
                            }
                            
                            // Now delete the call document from Firestore
                            await deleteDoc(callDocRef);
                        }
                    } catch (error) {
                        console.error("Error during cleanup:", error);
                    }
                
                    // Navigate back to the home page (or wherever you want)
                    navigate('/');
                }
                
            } catch (error) {
                console.error('Error in Firestore snapshot listener:', error);
            }
        });

        return () => {
            unsubscribe();
            cleanup();
        };
    }, [callDocRef, isCaller, handleOffer, handleAnswer, handleRemoteICECandidates, cleanup, navigate]);

    useEffect(() => {
        const fetchTranslationStatus = async () => {
            const docSnapshot = await getDoc(callDocRef);
            if (docSnapshot.exists()) {
                setIsTranslation(docSnapshot.data()?.translationEnabled || false);
            }
        };

        fetchTranslationStatus();
    }, [callDocRef]);

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 p-4">
            <div className="grid grid-cols-2 gap-4 mb-4 w-full max-w-3xl mx-auto">
                <div className="relative">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="rounded-lg w-96"
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
                        muted
                        className="rounded-lg w-96"
                    />
                     <p className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">
                        Remote User(TODO:add user name here)
                    </p>
                </div>
            </div>
            {remoteStream && <RemoteStreamAudioEquilizer audioStream={audioStream} />}

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
