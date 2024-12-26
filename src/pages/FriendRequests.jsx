import React, { useState, useEffect } from "react";
import { db, auth } from "../config/firebase";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { toast } from "react-toastify";

const FriendRequests = () => {
  const [requests, setRequests] = useState([]);
  const [userNames, setUserNames] = useState({});
  const userId = auth.currentUser?.uid;

  // Fetch incoming friend requests
  useEffect(() => {
    const fetchRequests = () => {
      try {
        const requestsRef = collection(db, "friendRequests");
        const q = query(requestsRef, where("to", "==", userId), where("status", "==", "pending"));

        // Real-time listener for friend requests
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const incomingRequests = [];
          querySnapshot.forEach((doc) => {
            incomingRequests.push(doc.data());
          });
          setRequests(incomingRequests);
        });

        return () => unsubscribe(); // Cleanup listener on unmount
      } catch (error) {
        console.error("Error fetching friend requests:", error);
      }
    };

    if (userId) {
      fetchRequests();
    }
  }, [userId]);

  // Fetch user names
  useEffect(() => {
    const fetchUserNames = async () => {
      try {
        const userRef = doc(db, "users", userId);
        const userSnapshot = await userRef.get();
        if (userSnapshot.exists()) {
          const userData = userSnapshot.data();
          setUserNames((prev) => ({
            ...prev,
            [userId]: userData.displayName,
          }));
        }
      } catch (error) {
        console.error("Error fetching user names:", error);
      }
    };

    if (userId) {
      fetchUserNames();
    }
  }, [userId]);

  // Accept friend request
  const handleAccept = async (request) => {
    try {
      const userRef = doc(db, "users", userId, "friends", request.from);
      const friendRef = doc(db, "users", request.from, "friends", userId);

      await setDoc(userRef, { name: auth.currentUser.displayName, email: auth.currentUser.email });
      await setDoc(friendRef, { name: auth.currentUser.displayName, email: auth.currentUser.email });

      await setDoc(doc(db, "friendRequests", request.from + "_" + userId), { status: "accepted" });

      toast.success(`You are now friends with ${request.from}!`);
      setRequests((prev) => prev.filter((r) => r.from !== request.from));
    } catch (error) {
      console.error("Error accepting friend request:", error);
      toast.error("Failed to accept friend request.");
    }
  };

  // Reject friend request
  const handleReject = async (request) => {
    try {
      await deleteDoc(doc(db, "friendRequests", request.from + "_" + userId));
      toast.error(`Friend request from ${request.from} rejected.`);
      setRequests((prev) => prev.filter((r) => r.from !== request.from));
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      toast.error("Failed to reject friend request.");
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Friend Requests</h2>
      <div className="space-y-4">
        {requests.length === 0 ? (
          <p className="text-gray-500">No new friend requests.</p>
        ) : (
          requests.map((request) => {
            const senderName = userNames[request.from] || "Request"; // Default to "Loading..." until name is fetched

            return (
              <div key={request.from} className="flex items-center justify-between p-4 bg-white rounded shadow-lg">
                <div className="flex items-center space-x-4">
                  <h3 className="text-lg font-semibold">{senderName}</h3>
                </div>
                <div>
                  <button
                    onClick={() => handleAccept(request)}
                    className="px-4 py-2 text-white bg-green-600 rounded hover:bg-green-700"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleReject(request)}
                    className="px-4 py-2 text-white bg-red-600 rounded hover:bg-red-700 ml-2"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default FriendRequests;
