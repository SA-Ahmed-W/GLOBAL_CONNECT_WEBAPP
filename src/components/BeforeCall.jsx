// src/pages/CallUI.jsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { db, auth } from "../config/firebase";
import { doc, getDoc, addDoc, collection, setDoc,query,where,onSnapshot } from "firebase/firestore";

const BeforeCall = () => {
  const { friendId } = useParams(); // Retrieve friendId from URL params
  const navigate = useNavigate();
  const { state: { fid } } = useLocation()
  const [currentUser, setCurrentUser] = useState(null);

  // State variables
  const [friend, setFriend] = useState(null);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [inputLanguage, setInputLanguage] = useState("HINDI");
  const [outputLanguage, setOutputLanguage] = useState("ENGLISH");

  const languages = ["HINDI", "ENGLISH", "KANNADA", "MALAYALAM"];

  // Fetch friend details from Firestore
  useEffect(() => {
    const fetchFriendDetails = async () => {
      try {
        const friendDoc = await getDoc(doc(db, "users", fid));
        if (friendDoc.exists()) {
          setFriend(friendDoc.data());
        } else {
          console.log("No such friend!");
        }
      } catch (error) {
        console.error("Error fetching friend details:", error);
      }
    };

    fetchFriendDetails();
  }, [fid]);

  useEffect(() => {

    const checkAuth = () => {
      const user = auth.currentUser;
      if (user) {
        setCurrentUser(user);
        listenForCallReject(user.uid)
        listenForCallAccept(user.uid)

      } else {
        navigate('/login');
      }
    };

    checkAuth();
  }, [navigate]);


  const handleMakeCall = async () => {
    // Check if input and output languages are different when translation is enabled
    if (translationEnabled && inputLanguage === outputLanguage) {
      alert("Input and output languages should be different.");
      return;
    }

    // Logic to initiate the call with the selected settings
    const callSettings = {
      callerId: currentUser.uid,
      receiverId: fid,
      translationEnabled,
      inputLanguage: translationEnabled ? inputLanguage : null,
      outputLanguage: translationEnabled ? outputLanguage : null,
      status: 'pending'
    };


    if (currentUser) {
      console.log("call initiated")
      const docRef = await addDoc(collection(db, 'calls'),{})
      await setDoc(docRef, callSettings)
    }
  };

  const listenForCallReject = (userId) => {
    const callQuery = query(
      collection(db, 'calls'),
      where('callerId', '==', userId),
      where('status', '==', 'rejected')
    );

    onSnapshot(callQuery, (snapshot) => {
      if (!snapshot.empty) {
        const callData = snapshot.docs[0].data();
        if (callData?.status === "rejected") {
          console.log("call rejected");
          navigate("/")
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

    onSnapshot(callQuery, (snapshot) => {
      if (!snapshot.empty) {
        const callData = snapshot.docs[0].data();
        const callId = snapshot.docs[0].id; // Extract the call ID from the snapshot
        if (callData?.status === "accepted") {
          console.log("A call accepted");
          navigate('/video-call', { state: { callId, isCaller: true } });
        }
      }
    });
  };

  return (
    <div className="p-6 bg-white rounded shadow-lg max-w-md mx-auto space-y-4">
      <h2 className="text-2xl font-bold">Call with Friend</h2>

      {/* Friend details */}
      {friend ? (
        <div className="flex items-center space-x-4">
          <img
            src={friend.profilePic || "/default-avatar.png"}
            alt="Profile"
            className="w-16 h-16 rounded-full"
          />
          <div>
            <h3 className="text-lg font-semibold">{friend.name}</h3>
            <p className="text-sm text-gray-600">{friend.email}</p>
          </div>
        </div>
      ) : (
        <p>Loading friend details...</p>
      )}

      {/* Translation option */}
      <div className="space-y-2">
        <h4 className="font-semibold">Enable Translation</h4>
        <div className="flex items-center space-x-4">
          <label>
            <input
              type="radio"
              name="translation"
              value="no"
              checked={!translationEnabled}
              onChange={() => setTranslationEnabled(false)}
            />
            <span className="ml-2">No</span>
          </label>
          <label>
            <input
              type="radio"
              name="translation"
              value="yes"
              checked={translationEnabled}
              onChange={() => setTranslationEnabled(true)}
            />
            <span className="ml-2">Yes</span>
          </label>
        </div>
      </div>

      {/* Language selection */}
      {translationEnabled && (
        <div className="space-y-4">
          <div>
            <label className="font-semibold">Input Language</label>
            <select
              className="block w-full mt-1 p-2 border rounded"
              value={inputLanguage}
              onChange={(e) => setInputLanguage(e.target.value)}
            >
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold">Output Language</label>
            <select
              className="block w-full mt-1 p-2 border rounded"
              value={outputLanguage}
              onChange={(e) => setOutputLanguage(e.target.value)}
            >
              {languages
                .filter((lang) => lang !== inputLanguage)
                .map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {/* Make Call button */}
      <button
        onClick={handleMakeCall}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        disabled={!friend}
      >
        Make the Call
      </button>
    </div>
  );
};

export default BeforeCall;
