import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { db, auth } from "../config/firebase";
import { doc, setDoc, updateDoc, onSnapshot, deleteDoc } from "firebase/firestore";

const CallSession = () => {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { friendId, translationEnabled, inputLanguage, outputLanguage } = state || {};

  const [callAccepted, setCallAccepted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);

  const [friend, setFriend] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);

  useEffect(() => {
    const fetchFriendDetails = async () => {
      const friendDocRef = doc(db, "users", friendId);
      onSnapshot(friendDocRef, (doc) => {
        if (doc.exists()) {
          setFriend(doc.data());
        } else {
          console.log("No such friend!");
        }
      });
    };

    fetchFriendDetails();
  }, [friendId]);

  useEffect(() => {
    const initializeCall = async () => {
      try {
        // Set up local video and audio stream
        const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current.srcObject = localStream;

        // Initialize WebRTC connection
        const peerConnection = new RTCPeerConnection();
        peerConnectionRef.current = peerConnection;

        // Add local tracks to peer connection
        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

        // Set up call document in Firestore
        await setDoc(doc(db, "calls", friendId), {
          callerId: auth.currentUser.uid,
          calleeId: friendId,
          status: "incoming",
          translationEnabled,
          inputLanguage,
          outputLanguage,
        });

        // Handle remote track received event
        peerConnection.ontrack = (event) => {
          if (remoteStreamRef.current) {
            remoteStreamRef.current.srcObject = event.streams[0];
          }
        };

        // Listen for call acceptance/rejection
        const callDocRef = doc(db, "calls", friendId);
        const unsubscribe = onSnapshot(callDocRef, async (snapshot) => {
          const callData = snapshot.data();
          if (callData?.status === "accepted") {
            setCallAccepted(true);
            // Create and send answer if call is accepted
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await updateDoc(callDocRef, { status: "ongoing", answer });
          } else if (callData?.status === "rejected") {
            endCall();
            alert("Call rejected by friend.");
          }
        });

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            // Send the candidate to the other peer
            updateDoc(callDocRef, { candidates: firebase.firestore.FieldValue.arrayUnion(event.candidate) });
          }
        };

        // Listen for ICE candidates from Firestore
        const unsubscribeCandidates = onSnapshot(callDocRef, (snapshot) => {
          const callData = snapshot.data();
          if (callData?.candidates) {
            callData.candidates.forEach(async (candidate) => {
              await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            });
          }
        });

        return () => {
          unsubscribe();
          unsubscribeCandidates();
          endCall();
        };
      } catch (error) {
        console.error("Error initializing call:", error);
      }
    };

    initializeCall();
  }, [friendId]);

  // Toggle microphone mute/unmute
  const toggleMute = () => {
    const localStream = localStreamRef.current.srcObject;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    setIsMuted(!isMuted);
  };

  // Toggle camera on/off
  const toggleCamera = () => {
    const localStream = localStreamRef.current.srcObject;
    localStream.getVideoTracks()[0].enabled = !cameraOff;
    setCameraOff(!cameraOff);
  };

  // End call and navigate back to home
  const endCall = async () => {
    peerConnectionRef.current?.close();
    await deleteDoc(doc(db, "calls", friendId));
    navigate("/");
  };

  return (
    <div className="p-6 bg-white rounded shadow-lg max-w-md mx-auto space-y-4">
      <h2 className="text-2xl font-bold">Video Call</h2>

      <div className="relative w-full h-full">
        {/* Remote video (large) */}
        {callAccepted && (
          <video ref={remoteStreamRef} autoPlay playsInline className="w-full h-80 rounded-lg mb-4" />
        )}

        {/* Local video (small) */}
        <video
          ref={localStreamRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-4 right-4 w-24 h-24 rounded-lg shadow-lg"
        />
      </div>

      <div className="flex space-x-4 justify-center">
        {/* Mute/unmute button */}
        <button
          onClick={toggleMute}
          className={`w-full py-2 rounded ${isMuted ? "bg-gray-400" : "bg-blue-600"} text-white hover:bg-blue-700`}
        >
          {isMuted ? "Unmute" : "Mute"}
        </button>

        {/* Hide/show camera button */}
        <button
          onClick={toggleCamera}
          className={`w-full py-2 rounded ${cameraOff ? "bg-gray-400" : "bg-blue-600"} text-white hover:bg-blue-700`}
        >
          {cameraOff ? "Show Camera" : "Hide Camera"}
        </button>

        {/* End call button */}
        <button
          onClick={endCall}
          className="w-full py-2 rounded bg-red-600 text-white hover:bg-red-700"
        >
          End Call
        </button>
      </div>
    </div>
  );
};

export default CallSession;
