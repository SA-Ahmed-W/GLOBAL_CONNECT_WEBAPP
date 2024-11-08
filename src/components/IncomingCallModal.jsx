import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc, onSnapshot, getDoc } from "firebase/firestore";
import { db, auth } from "../config/firebase";

const IncomingCallModal = ({ callerId, onAccept, onReject }) => {

  const [callerData, setCallerData] = useState({})

  // console.log(callData);
  const navigate = useNavigate();
  useEffect(() => {

    const getData = async () => {
      let data = await getDoc(doc(db, "users", callerId))
      if (data.exists()) {
        // console.log(data.data());
        setCallerData(data.data())

      }
    }
    getData()


  }, []);

  useEffect(() => {
    // Listen for changes to the call document
    const callDocRef = doc(db, "calls", auth.currentUser.uid); //auth.currentUser.uid
    const unsubscribe = onSnapshot(callDocRef, (snapshot) => {
      const callData = snapshot.data();
      if (callData?.status === "accepted") {
        // Navigate to CallSession on call acceptance
        navigate(`/call/session/$callData.calleeId`, {
          state: {
            friendId: callData.callerId,
            translationEnabled: callData.translationEnabled,
            inputLanguage: callData.inputLanguage,
            outputLanguage: callData.outputLanguage,
          },
        });
      }
    });

    return () => unsubscribe();
  }, [callerId, navigate]);

  useEffect(() => {
    // Listen for changes to the call document
    const callDocRef = doc(db, "calls", auth.currentUser.uid); //auth.currentUser.uid
    const unsubscribe = onSnapshot(callDocRef, (snapshot) => {
      const callData = snapshot.data();
      if (callData?.status === "didnt answer") {
        console.log("no answer");
        navigate(`/`);
      }
    });

    return () => unsubscribe();
  }, [callerId, navigate]);


  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-6 rounded shadow-lg max-w-md space-y-4">
        <h2 className="text-xl font-bold">Incoming Call</h2>
        <div className="flex items-center space-x-4">
          <img src={callerData.profilePic || "/default-avatar.png"} alt="Profile" className="w-12 h-12 rounded-full" />
          <div>
            <h3 className="text-lg font-semibold">{callerData.name}</h3>
            <p className="text-sm text-gray-600">{callerData.email}</p>
          </div>
        </div>
        <div className="flex space-x-4">
          <button onClick={onAccept} className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700">
            Accept
          </button>
          <button onClick={onReject} className="flex-1 bg-red-600 text-white py-2 rounded hover:bg-red-700">
            Reject
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
