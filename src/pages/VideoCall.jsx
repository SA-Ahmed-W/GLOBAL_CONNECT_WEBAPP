import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../config/firebase';
import { doc, getDoc, updateDoc, onSnapshot, deleteDoc, arrayUnion } from 'firebase/firestore';

const VideoCall = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const callId = location.state?.callId;
    const isCaller = location.state?.isCaller || false;

    // Refs
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);

    // State
    const [error, setError] = useState(null);
    const [connectionState, setConnectionState] = useState('initializing');
    const [remoteStream, setRemoteStream] = useState(null);

    // WebRTC configuration
    const configuration = useMemo(() => ({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    }), []);
    // Initialize media devices and create peer connection
     // Initialize media devices and create peer connection
     const initializeCall = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            const peerConnection = new RTCPeerConnection(configuration);
            peerConnectionRef.current = peerConnection;

            // Add local tracks to peer connection
            stream.getTracks().forEach(track => {
                peerConnection.addTrack(track, stream);
            });

            // Handle incoming remote stream
            peerConnection.ontrack = (event) => {
                console.log('Received remote track:', event.streams[0]);
                if (remoteVideoRef.current && event.streams[0]) {
                    remoteVideoRef.current.srcObject = event.streams[0];
                    setRemoteStream(event.streams[0]);
                }
            };

            // Handle ICE candidates - Fixed Firebase reference
            peerConnection.onicecandidate = async (event) => {
                if (event.candidate) {
                    console.log('New ICE candidate:', event.candidate);
                    const candidateData = event.candidate.toJSON();
                    const docRef = doc(db, 'calls', callId);
                    
                    try {
                        await updateDoc(docRef, {
                            [`${isCaller ? 'callerCandidates' : 'calleeCandidates'}`]: arrayUnion(candidateData)
                        });
                    } catch (err) {
                        console.error('Error adding ICE candidate:', err);
                    }
                }
            };

            // Handle connection state changes
            peerConnection.onconnectionstatechange = () => {
                console.log('Connection state changed:', peerConnection.connectionState);
                setConnectionState(peerConnection.connectionState);
                if (peerConnection.connectionState === 'connected') {
                    updateCallStatus('ongoing');
                }
            };

            // Handle ICE connection state changes
            peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state:', peerConnection.iceConnectionState);
            };

            if (isCaller) {
                await createOffer();
            }
        } catch (err) {
            setError(`Failed to initialize call: ${err.message}`);
            console.error('Initialize call error:', err);
        }
    }, [configuration, isCaller, callId]);

    // Create and set offer (caller)
    
    // Create and set offer (caller) - Fixed SDP handling
    const createOffer = async () => {
        try {
            const peerConnection = peerConnectionRef.current;
            if (!peerConnection) {
                throw new Error('PeerConnection not initialized');
            }

            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            // Set local description before sending the offer
            await peerConnection.setLocalDescription(new RTCSessionDescription(offer));
            
            // Wait for ICE gathering to complete
            await new Promise(resolve => {
                if (peerConnection.iceGatheringState === 'complete') {
                    resolve();
                } else {
                    peerConnection.addEventListener('icegatheringstatechange', () => {
                        if (peerConnection.iceGatheringState === 'complete') {
                            resolve();
                        }
                    });
                }
            });

            // Send the offer with the final SDP
            await updateDoc(doc(db, 'calls', callId), {
                offer: {
                    type: peerConnection.localDescription.type,
                    sdp: peerConnection.localDescription.sdp
                }
            });
        } catch (err) {
            setError(`Failed to create offer: ${err.message}`);
            console.error('Create offer error:', err);
        }
    };

    // Create and set answer (callee)
    const createAnswer = async (offer) => {
        try {
            console.log('Setting remote description:', offer);
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await peerConnectionRef.current.createAnswer();
            console.log('Created answer:', answer);
            await peerConnectionRef.current.setLocalDescription(answer);
            
            await updateDoc(doc(db, 'calls', callId), {
                answer: {
                    type: answer.type,
                    sdp: answer.sdp
                },
                status: 'ongoing'
            });
        } catch (err) {
            setError(`Failed to create answer: ${err.message}`);
            console.error('Create answer error:', err);
        }
    };

    // Handle ICE candidates
    const handleICECandidates = useCallback(async (data) => {
        try {
            const candidatesArray = isCaller ? data.calleeCandidates : data.callerCandidates;
            if (candidatesArray && Array.isArray(candidatesArray)) {
                for (const candidate of candidatesArray) {
                    if (candidate && !peerConnectionRef.current.remoteDescription) {
                        console.log('Waiting for remote description before adding candidates');
                        return;
                    }
                    if (candidate) {
                        console.log('Adding ICE candidate:', candidate);
                        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                }
            }
        } catch (err) {
            console.error('Error handling ICE candidates:', err);
        }
    }, [isCaller]);

    // Update call status in Firestore
    const updateCallStatus = async (status) => {
        try {
            await updateDoc(doc(db, 'calls', callId), { status });
        } catch (err) {
            console.error('Failed to update call status:', err);
        }
    };

    // Clean up resources
    const cleanup = useCallback(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
        }
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
        if (callId) {
            deleteDoc(doc(db, 'calls', callId)).catch(console.error);
        }
    }, [callId]);

    // Handle end call
    const endCall = useCallback(async () => {
        try {
            await updateCallStatus('ended');
            cleanup();
            navigate('/');
        } catch (err) {
            setError(`Failed to end call: ${err.message}`);
        }
    }, [cleanup, navigate]);

    // Initialize call and set up listeners
    useEffect(() => {
        if (!callId) {
            navigate('/');
            return;
        }

        initializeCall();

        // Set up Firestore listener
        const unsubscribe = onSnapshot(doc(db, 'calls', callId), async (snapshot) => {
            const data = snapshot.data();
            if (!data) return;

            console.log('Call document updated:', data);

            if (data.status === 'ended') {
                cleanup();
                navigate('/');
                return;
            }

            if (!isCaller && data.offer && !peerConnectionRef.current.currentRemoteDescription) {
                await createAnswer(data.offer);
            }

            if (isCaller && data.answer && !peerConnectionRef.current.currentRemoteDescription) {
                console.log('Setting remote description for caller:', data.answer);
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            }

            // Handle ICE candidates
            await handleICECandidates(data);
        });

        // Cleanup on unmount
        return () => {
            unsubscribe();
        };
    }, [callId, navigate, initializeCall, cleanup, isCaller, handleICECandidates]);

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
                    onClick={endCall}
                    className="p-3 rounded-full bg-red-500 text-white hover:bg-red-600"
                >
                    End Call
                </button>
            </div>
            <div className="absolute top-4 left-4 bg-black bg-opacity-50 text-white p-2 rounded">
                <p>Status: {connectionState}</p>
            </div>
        </div>
    );
};

export default VideoCall;