import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../config/firebase';
import { doc, updateDoc, onSnapshot, deleteDoc, arrayUnion, getDoc } from 'firebase/firestore';

const VideoCall = () => {
    const [peerConnection, setPeerConnection] = useState(null);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [connectionState, setConnectionState] = useState('');
    const [error, setError] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();

    const callId = location.state?.callId;
    const isCaller = location.state?.isCaller || false;

    // Create a stable remote media stream
    const remoteMediaStream = useMemo(() => new MediaStream(), []);

    useEffect(() => {
        if (!callId) {
            setError('No call ID provided');
            navigate('/');
            return;
        }

        initializeCall();
        // return () => cleanUpCall();
    }, [callId, isCaller, navigate]);

    const createPeerConnection = useCallback(() => {
        try {
            const pc = new RTCPeerConnection({
                iceServers: [
                    {
                        urls: [
                            'stun:stun.l.google.com:19302',
                            'stun:global.stun.twilio.com:3478',
                        ],
                    },
                ],
                iceCandidatePoolSize: 10,
            });

            // Connection state handling
            pc.onconnectionstatechange = () => {
                setConnectionState(pc.connectionState);
                console.log('Connection state:', pc.connectionState);
            };

            pc.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', pc.iceConnectionState);
                if (pc.iceConnectionState === 'failed') {
                    setError('Connection failed. Retrying...');
                    // Potentially reset or attempt reconnection here
                }
            };


            // Track handling
            pc.ontrack = (event) => {
                console.log('Received track:', event.track.kind);
                if (!remoteMediaStream.getTracks().includes(event.track)) {
                    remoteMediaStream.addTrack(event.track);
                    setRemoteStream(remoteMediaStream);

                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = remoteMediaStream;
                    }
                }
            };

            return pc;
        } catch (error) {
            console.error('Error creating peer connection:', error);
            setError('Failed to create peer connection');
            return null;
        }
    }, [remoteMediaStream]);

    const initializeCall = async () => {
        console.log('Initializing call');
        const pc = createPeerConnection();
        if (!pc) return;

        setPeerConnection(pc);

        try {
            // Check the current call status before proceeding
            const callDoc = doc(db, 'calls', callId);
            const callSnapshot = await getDoc(callDoc);
            const callData = callSnapshot.data();
            if (callData?.status === 'ended') {
                setError('The call has already ended');
                navigate('/');
                return;
            }
            await setCallStatus('ongoing');
            await setupLocalStream(pc);
            setupICECandidateHandling(pc);
            setupFirestoreListeners(pc);
            if (isCaller) await createAndSendOffer(pc);
        } catch (error) {
            console.error('Error initializing call:', error);
            setError('Failed to initialize call');
        }

        listenForCallEnded(callId);
    };

    const setCallStatus = useCallback(async (status) => {
        if (!callId) return;
        try {
            await updateDoc(doc(db, 'calls', callId), { status });
        } catch (error) {
            console.error('Error updating call status:', error);
        }
    }, [callId]);

    const setupLocalStream = useCallback(async (pc) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });

            setLocalStream(stream);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
                console.log('Added local track:', track.kind);
            });
        } catch (error) {
            console.error('Error accessing media devices:', error);
            setError('Failed to access camera or microphone');
        }
    }, []);

    const setupICECandidateHandling = useCallback((pc) => {
        pc.onicecandidate = async (event) => {
            if (event.candidate) {
                const candidateField = isCaller ? 'callerCandidates' : 'receiverCandidates';
                try {
                    await updateDoc(doc(db, 'calls', callId), {
                        [candidateField]: arrayUnion(event.candidate.toJSON()),
                    });
                } catch (error) {
                    console.error('Error sending ICE candidate:', error);
                }
            }
        };
    }, [isCaller, callId]);


    const setupFirestoreListeners = useCallback((pc) => {
        const callDoc = doc(db, 'calls', callId);
        onSnapshot(callDoc, async (snapshot) => {
            const data = snapshot.data();
            if (!data) {
                setError('Call document not found');
                navigate('/');
                return;
            }

            try {
                if (isCaller && data.answer && !pc.remoteDescription) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                } else if (!isCaller && data.offer && !pc.remoteDescription) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    await updateDoc(callDoc, { answer: { type: answer.type, sdp: answer.sdp } });
                }

                const candidates = data[isCaller ? 'receiverCandidates' : 'callerCandidates'];
                if (candidates?.length > 0) {
                    for (const candidate of candidates) {
                        try {
                            if (pc.remoteDescription) {
                                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                            }
                        } catch (error) {
                            console.error('Error adding ICE candidate:', error);
                        }
                    }
                }
            } catch (error) {
                console.error('Error in Firestore listener:', error);
                setError('Connection error occurred');
            }
        });
    }, [isCaller, callId, navigate]);


    const createAndSendOffer = useCallback(async (pc) => {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await updateDoc(doc(db, 'calls', callId), {
                offer: { sdp: offer.sdp, type: offer.type },
            });
        } catch (error) {
            console.error('Error creating offer:', error);
            setError('Failed to create call offer');
        }
    }, [callId]);

    const listenForCallEnded = useCallback((callId) => {
        onSnapshot(doc(db, "calls", callId), async (snapshot) => {
            const callData = snapshot.data();
            if (callData?.status === "ended") {
                await cleanUpCall();
                navigate('/');
            }
        });
    }, [navigate]);

    const cleanUpCall = useCallback(async () => {
        console.log('Cleaning up call');
        if (peerConnection) {
            peerConnection.close();
            setPeerConnection(null);
        }

        [localStream, remoteStream].forEach(stream => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        });

        setLocalStream(null);
        setRemoteStream(null);

        [localVideoRef, remoteVideoRef].forEach(ref => {
            if (ref.current) {
                ref.current.srcObject = null;
            }
        });

        try {
            await deleteDoc(doc(db, 'calls', callId));
        } catch (error) {
            console.error('Error cleaning up call:', error);
        }
    }, [peerConnection, localStream, remoteStream, callId]);

    const toggleAudio = useCallback(() => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    }, [localStream]);

    const toggleVideo = useCallback(() => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoOff(!videoTrack.enabled);
            }
        }
    }, [localStream]);

    const endCall = useCallback(async () => {
        try {
            await updateDoc(doc(db, 'calls', callId), { status: 'ended' });
            navigate('/');
        } catch (error) {
            console.error('Error ending call:', error);
            setError('Failed to end call');
        }
    }, [callId, navigate]);


    return (
        <div className="relative h-screen bg-gray-900">
            {error && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg z-50">
                    {error}
                </div>
            )}

            <div className="flex items-center justify-center h-full">
                <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                />
                {!remoteStream && (
                    <div className="absolute inset-0 flex items-center justify-center text-white bg-gray-800 bg-opacity-75">
                        <p className="text-xl">Waiting for remote video...</p>
                    </div>
                )}
            </div>

            <div className="absolute bottom-4 right-4 w-1/4 aspect-video rounded-lg overflow-hidden shadow-lg">
                <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                />
            </div>

            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-4">
                <button
                    onClick={toggleAudio}
                    className={`p-3 rounded-full ${isMuted ? 'bg-red-500' : 'bg-gray-600'} text-white hover:opacity-80`}
                >
                    {isMuted ? 'Unmute' : 'Mute'}
                </button>
                <button
                    onClick={toggleVideo}
                    className={`p-3 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-gray-600'} text-white hover:opacity-80`}
                >
                    {isVideoOff ? 'Start Video' : 'Stop Video'}
                </button>
                <button
                    onClick={endCall}
                    className="p-3 rounded-full bg-red-500 text-white hover:bg-red-600"
                >
                    End Call
                </button>
            </div>

            {/* Connection status indicator */}
            <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white p-2 rounded">
                <p>Status: {connectionState || 'Connecting...'}</p>
            </div>
        </div>
    );
};

export default VideoCall;


