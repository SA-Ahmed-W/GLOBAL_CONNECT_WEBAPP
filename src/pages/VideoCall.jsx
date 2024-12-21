import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useLocation, useNavigate } from 'react-router-dom';
import TranslationArea from '../components/TranslationArea';
import RemoteStreamAudioEquilizer from '../components/RemoteStreamAudioEquilizer';
import LocalTranslationAndSend from '../components/LocalTranslationAndSend';
import RemoteReceiveAndDisplay from "../components/RemoteReceiveAndDisplay"

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
        if (RTCRtpTransceiver.prototype.setDirection) {
            pc.addTransceiver('audio', { direction: 'sendrecv' });
            pc.addTransceiver('video', { direction: 'sendrecv' });
        }
    }, []);

    const initializePeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection(servers);

        // Setup tracks before creating offer/answer
        setupTransceivers(pc);

        // Create a DataChannel
        const dataChannel = pc.createDataChannel("translationChannel");
        pc.dataChannel = dataChannel;

        dataChannel.onopen = () => console.log("DataChannel is open");
        dataChannel.onclose = () => console.log("DataChannel is closed");

        pc.ontrack = (event) => {
            console.log('ontrack event:', event);
            if (event.streams && event.streams[0]) {
                console.log('Setting remote stream');
                setRemoteStream(event.streams[0]);

                // Extract audio tracks
                const audioTracks = event.streams[0].getAudioTracks();
                if (audioTracks.length > 0) {
                    const audioOnlyStream = new MediaStream(audioTracks);
                    setAudioStream(audioOnlyStream);
                }

                // Ensure remote video is set
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
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                setIsConnected(true);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('Connection State:', pc.connectionState);
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [servers, setupTransceivers]);

    const handleICECandidateEvent = useCallback(async (candidate) => {
        const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
        try {
            const docData = (await getDoc(callDocRef)).data() || {};
            const candidates = docData[field] || [];
            await updateDoc(callDocRef, {
                [field]: [...candidates, candidate.toJSON()]
            });
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }, [isCaller, callDocRef]);

    const setupLocalStream = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            localStreamRef.current = stream;

            // Ensure peer connection exists before adding tracks
            if (peerConnectionRef.current) {
                stream.getTracks().forEach(track => {
                    console.log('Adding track to peer connection:', track.kind);
                    peerConnectionRef.current.addTrack(track, stream);
                });
            }

            return stream;
        } catch (error) {
            console.error('Error accessing media devices:', error);
            throw error;
        }
    }, []);

    const createOffer = useCallback(async () => {
        const pc = peerConnectionRef.current;
        if (!pc) return;

        try {
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

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

    const handleOffer = useCallback(async (offer) => {
        const pc = peerConnectionRef.current;
        if (!pc || signalingStateRef.current !== 'new') return;

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

    const handleAnswer = useCallback(async (answer) => {
        const pc = peerConnectionRef.current;
        if (!pc || signalingStateRef.current !== 'have-local-offer') return;

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            signalingStateRef.current = 'stable';
            setIsConnected(true);
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }, []);

    const handleRemoteICECandidates = useCallback(async (candidates) => {
        const pc = peerConnectionRef.current;
        if (!pc || !candidates?.length) return;

        for (const candidate of candidates) {
            try {
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
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
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }

        try {
            await updateDoc(callDocRef, {
                status: 'ended',
                endedAt: new Date().toISOString()
            });

            // Update user status
            if (auth.currentUser) {
                const userDocRef = doc(db, "users", auth.currentUser.uid);
                await updateDoc(userDocRef, { status: 'online' });
            }
        } catch (error) {
            console.error('Error ending call:', error);
        }

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
        setRemoteStream(null);
        setAudioStream(null);
    }, []);

    // Initial setup effect
    useEffect(() => {
        const setupCall = async () => {
            const pc = initializePeerConnection();
            await setupLocalStream();
            if (isCaller) {
                await createOffer();
            }
        };

        setupCall();
        return cleanup;
    }, [initializePeerConnection, setupLocalStream, createOffer, cleanup, isCaller]);

    // Signaling effect
    useEffect(() => {
        const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            try {
                if (!isCaller && data.offer && !data.answer) {
                    await handleOffer(data.offer);
                }

                if (isCaller && data.answer && signalingStateRef.current === 'have-local-offer') {
                    await handleAnswer(data.answer);
                }

                const candidates = isCaller ? data.calleeCandidates : data.callerCandidates;
                if (candidates?.length) {
                    await handleRemoteICECandidates(candidates);
                }

                if (data.status === 'ended') {
                    cleanup();
                    try {
                        const docSnapshot = await getDoc(callDocRef);
                        if (docSnapshot.exists()) {
                            const callData = docSnapshot.data();
                            const receiverId = isCaller ? callData.receiverId : callData.callerId;

                            if (receiverId) {
                                const userRef = doc(db, "users", receiverId);
                                await updateDoc(userRef, { status: "online" });
                            }

                            await deleteDoc(callDocRef);
                        }
                    } catch (error) {
                        console.error("Error during cleanup:", error);
                    }
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

    // Translation status effect
    useEffect(() => {
        const fetchTranslationStatus = async () => {
            try {
                const docSnapshot = await getDoc(callDocRef);
                if (docSnapshot.exists()) {
                    setIsTranslation(docSnapshot.data()?.translationEnabled || false);
                }
            } catch (error) {
                console.error('Error fetching translation status:', error);
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
                        className="rounded-lg w-full h-auto"
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
                        className="rounded-lg w-full h-auto"
                    />
                    <p className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">
                        Remote User
                    </p>
                </div>
            </div>

            {remoteStream && <RemoteStreamAudioEquilizer audioStream={audioStream} />}

            <div className="flex justify-center gap-4 mt-4">
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

            {isTranslation ?
                (
                    <>
                    <LocalTranslationAndSend
                        peerConnection={peerConnectionRef.current}
                        callDocId={callDocId}
                        isCaller={isCaller}
                    />
                    <RemoteReceiveAndDisplay peerConnection={peerConnectionRef.current} />
                    </>
                )
                // (
                //     <TranslationArea
                //         callDocId={callDocId}
                //         isCaller={isCaller}
                //         remoteStream={remoteStream}
                //         remoteAudioStream={audioStream}
                //     />
                // ) 
                : (
                    <p className="text-center mt-4">Translation not enabled</p>
                )}
        </div>
    );
};

export default VideoCall;