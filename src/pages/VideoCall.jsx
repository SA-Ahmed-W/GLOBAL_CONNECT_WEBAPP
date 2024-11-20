import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);

    const servers = useMemo(() => ({
        iceServers: [
            {
                urls: [
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',
                ],
            },
        ],
    }), []);

    const callDocRef = useMemo(() => doc(db, 'calls', callDocId), [callDocId]);

    const initializePeerConnection = useCallback(() => {
        const pc = new RTCPeerConnection(servers);

        // Add tracks to peer connection
        pc.ontrack = (event) => {
            const stream = event.streams[0];
            setRemoteStream(stream);
            remoteVideoRef.current.srcObject = stream;

            // Set audio stream for visualizer
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
                const audioOnlyStream = new MediaStream(audioTracks);
                setAudioStream(audioOnlyStream);
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                handleICECandidate(event.candidate);
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', pc.iceConnectionState);
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [servers]);

    const handleICECandidate = useCallback(async (candidate) => {
        const field = isCaller ? 'callerCandidates' : 'calleeCandidates';
        const docData = (await getDoc(callDocRef)).data();
        await updateDoc(callDocRef, {
            [field]: [...(docData?.[field] || []), candidate.toJSON()],
        });
    }, [isCaller, callDocRef]);

    const setupLocalStream = useCallback(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true,
        });

        localVideoRef.current.srcObject = stream;
        localStreamRef.current = stream;

        stream.getTracks().forEach((track) => {
            peerConnectionRef.current.addTrack(track, stream);
        });
    }, []);

    const createOffer = useCallback(async () => {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);

        await updateDoc(callDocRef, {
            offer: {
                type: offer.type,
                sdp: offer.sdp,
            },
        });
    }, [callDocRef]);

    const handleOffer = useCallback(async (offer) => {
        if (peerConnectionRef.current.signalingState !== 'stable') return;

        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);

        await updateDoc(callDocRef, {
            answer: {
                type: answer.type,
                sdp: answer.sdp,
            },
        });
    }, [callDocRef]);

    const handleAnswer = useCallback(async (answer) => {
        if (peerConnectionRef.current.signalingState !== 'have-local-offer') return;

        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setIsConnected(true);
    }, []);

    const handleRemoteICECandidates = useCallback(async (candidates) => {
        for (const candidate of candidates || []) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
    }, []);

    const toggleAudio = useCallback(() => {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!audioTrack.enabled);
        }
    }, []);

    const toggleVideo = useCallback(() => {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            setIsVideoOff(!videoTrack.enabled);
        }
    }, []);

    const endCall = useCallback(async () => {
        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        peerConnectionRef.current?.close();

        await updateDoc(callDocRef, {
            status: 'ended',
            endedAt: new Date().toISOString(),
        });

        navigate('/');
    }, [callDocRef, navigate]);

    useEffect(() => {
        const pc = initializePeerConnection();
        setupLocalStream().then(() => {
            if (isCaller) createOffer();
        });

        return () => {
            localStreamRef.current?.getTracks().forEach((track) => track.stop());
            pc.close();
        };
    }, [initializePeerConnection, setupLocalStream, createOffer, isCaller]);

    useEffect(() => {
        const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            if (!isCaller && data.offer) await handleOffer(data.offer);
            if (isCaller && data.answer) await handleAnswer(data.answer);

            const candidates = isCaller ? data.calleeCandidates : data.callerCandidates;
            if (candidates) await handleRemoteICECandidates(candidates);

            if (data.status === 'ended') navigate('/');
        });

        return () => unsubscribe();
    }, [callDocRef, isCaller, handleOffer, handleAnswer, handleRemoteICECandidates, navigate]);

    useEffect(() => {
        (async () => {
            const docSnapshot = await getDoc(callDocRef);
            setIsTranslation(docSnapshot.data()?.translationEnabled || false);
        })();
    }, [callDocRef]);

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 p-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="relative">
                    <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full rounded-lg shadow-lg"
                    />
                    <p className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">You</p>
                </div>
                <div className="relative">
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full rounded-lg shadow-lg"
                    />
                    <p className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">Remote</p>
                </div>
            </div>
            <RemoteStreamAudioEquilizer audioStream={audioStream} />
            <div className="flex gap-4">
                <button onClick={toggleAudio} className={`px-4 py-2 rounded-full ${isMuted ? 'bg-red-500' : 'bg-blue-500'} text-white`}>
                    {isMuted ? 'Unmute' : 'Mute'}
                </button>
                <button onClick={toggleVideo} className={`px-4 py-2 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-blue-500'} text-white`}>
                    {isVideoOff ? 'Turn Video On' : 'Turn Video Off'}
                </button>
                <button onClick={endCall} className="px-4 py-2 rounded-full bg-red-500 text-white">End Call</button>
            </div>
            {isTranslation ? (
                <TranslationArea callDocId={callDocId} isCaller={isCaller} remoteStream={remoteStream} />
            ) : (
                <p>Translation is disabled.</p>
            )}
        </div>
    );
};

export default VideoCall;