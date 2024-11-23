import React, { useEffect, useState } from "react";
import { db, auth } from "../config/firebase";
import {collection, getDocs, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FaVideo } from "react-icons/fa";
import IncomingCallModal from "../components/IncomingCallModal";

const FriendsList = () => {
  const [friends, setFriends] = useState([]);
  const [statuses, setStatuses] = useState({});
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [XCallID,setCallID] = useState(null)

  useEffect(() => {
    const fetchFriends = () => {
      const userId = auth.currentUser.uid;
      const friendsRef = collection(db, "users", userId, "friends");

      const q = query(friendsRef);
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const friendsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setFriends(friendsData);

        friendsData.forEach((friend) => {
          const friendDocRef = doc(db, "users", friend.id);
          onSnapshot(friendDocRef, (friendSnapshot) => {
            const friendStatus = friendSnapshot.data()?.status;
            setStatuses((prevStatuses) => ({
              ...prevStatuses,
              [friend.id]: friendStatus,
            }));
          });
        });
      });

      return () => unsubscribe();
    };

    fetchFriends();
  }, []);

  useEffect(() => {

    const checkAuth = () => {
      const user = auth.currentUser;
      if (user) {
        setCurrentUser(user);
        listenForIncomingCalls(user.uid);
        listenForCallReject(user.uid)
        listenForCallAccept(user.uid)

      } else {
        navigate('/login');
      }
    };

    checkAuth();
  }, [navigate]);

  const listenForIncomingCalls = (userId) => {
    const callQuery = query(
      collection(db, 'calls'),
      where('receiverId', '==', userId),
      where('status', '==', 'pending')
    );

    onSnapshot(callQuery, (snapshot) => {
      if (!snapshot.empty) {
        const callData = snapshot.docs[0].data();
        setIncomingCall({ id: snapshot.docs[0].id, ...callData });
        setCallID(snapshot.docs[0].id)
        console.log("inccoming call")
      } else {
        setIncomingCall(null);
      }
    });
  };

  const listenForCallReject = (userId) => {
    // let callID = ""
    const callQuery = query(
      collection(db, 'calls'),
      where('callerId', '==', userId),
      where('status', '==', 'rejected')
    );
    // const docRef = doc(db, "calls", callID)

    onSnapshot(callQuery, (snapshot) => {
      if (!snapshot.empty) {
        const callData = snapshot.docs[0].data();
        if (callData?.status === "rejected") {
          console.log("A call rejected");
          setIncomingCall(null)

        }
      }
    });
  }
  const listenForCallAccept = (userId) => {
    const callQuery = query(
      collection(db, 'calls'),
      where('callerId', '==', userId),
      where('status', '==', 'accepted')
    );

    onSnapshot(callQuery, async(snapshot) => {
      if (!snapshot.empty) {
        const callData = snapshot.docs[0].data();
        const callId = snapshot.docs[0].id; // Extract the call ID from the snapshot
        if (callData?.status === "accepted") { 
          console.log("A call accepted");
          const callDocRef = doc(db, 'calls', callId);
          await updateDoc(callDocRef, { status: 'in call' });
          const userDocref = doc(db,"users",auth.currentUser.uid)
          await updateDoc(userDocref, { status: 'in call' });
          navigate('/video-call', { state: { callId, isCaller: true } });
          // navigate(`/before/call/${callId}`, { state: { callId, isCaller: true } });
        }
      }
    });
  };

  const handleCallTEMP = (friend) => {
    if (statuses[friend] === "online") {
      navigate(`/before/call/${friend}`, {state : {fid : friend}});
    } else {
      toast.info(`${friend.name} is not online.`);
    }
  };

  const handleCall = async (friend) => {
    if (currentUser) {
      console.log("call initiated")
      await addDoc(collection(db, 'calls'), {
        callerId: currentUser.uid,
        receiverId: friend,
        status: 'pending'
      });
    }
  };

  const handleAcceptCall = async (callId) => {
    const callDocRef = doc(db, 'calls', callId);
    await updateDoc(callDocRef, { status: 'accepted' });
    console.log("B call accpeeted")
    const userDocref = doc(db,"users",auth.currentUser.uid)
    await updateDoc(userDocref, { status: 'in call' });
    navigate('/video-call', { state: { callId, isCaller: false } });
    // navigate(`/before/call/${callId}`, { state: { callId, isCaller: false } });
  };


  const handleRejectCall = async (callId) => {
    const callDocRef = doc(db, 'calls', callId);
    await updateDoc(callDocRef, { status: 'rejected' });
    console.log("B call rejected")
    setTimeout(async () => {
      await deleteDoc(callDocRef);
      navigate('/');
    }, 5000);
    setIncomingCall(null);
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Friends List</h2>

      {incomingCall && (
        <IncomingCallModal
          callerId={incomingCall.callerId}
          onAccept={() => handleAcceptCall(incomingCall.id)}
          onReject={() => handleRejectCall(incomingCall.id)} />
      )}

      {friends.length === 0 ? (
        <p className="text-gray-500">No friends added yet.</p>
      ) : (
        <div className="space-y-4">
          {friends.map((friend) => (
            <div
              key={friend.id}
              className="flex items-center justify-between p-4 bg-white rounded shadow-lg"
            >
              <div className="flex items-center space-x-4">
                <img
                  src={friend.profilePic || "/default-avatar.png"}
                  alt="Profile"
                  className="w-12 h-12 rounded-full"
                />
                <div>
                  <h3 className="text-lg font-semibold">{friend.name}</h3>
                  <p className="text-sm text-gray-600 sm:break-words">{friend.email}</p>
                  <p
                    className={`text-xs ${statuses[friend.id] === "online"
                      ? "text-green-500"
                      : "text-gray-400"
                      }`}
                  >
                    {statuses[friend.id] || "offline"}
                  </p>
                </div>
              </div>
              {statuses[friend.id] === "online" && (
                <button
                  onClick={() => handleCallTEMP(friend.id)}
                  className="flex  items-cente space-x-2 text-blue-600 hover:text-blue-800"
                >
                  <FaVideo />
                  <span>Call</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FriendsList;
