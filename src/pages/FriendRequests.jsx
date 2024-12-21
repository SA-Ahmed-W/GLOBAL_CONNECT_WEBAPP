import React, { useState, useEffect } from "react";
import { db, auth } from "../config/firebase";
import { collection, query, where, getDocs, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { toast } from "react-toastify";

const FriendRequests = () => {
  const [requests, setRequests] = useState([]);
  const userId = auth.currentUser?.uid;

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const requestsRef = collection(db, "friendRequests");
        const q = query(requestsRef, where("to", "==", userId), where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);
        const incomingRequests = [];

        querySnapshot.forEach((doc) => {
          incomingRequests.push(doc.data());
        });

        setRequests(incomingRequests);
      } catch (error) {
        console.error("Error fetching friend requests:", error);
      }
    };

    if (userId) {
      fetchRequests();
    }
  }, [userId]);

  const handleAccept = async (request) => {
    try {
      const userRef = doc(db, "users", userId, "friends", request.from);
      const friendRef = doc(db, "users", request.from, "friends", userId);

      await updateDoc(doc(db, "friendRequests", request.from + "_" + userId), { status: "accepted" });

      await setDoc(userRef, { name: auth.currentUser.displayName, email: auth.currentUser.email });
      await setDoc(friendRef, { name: auth.currentUser.displayName, email: auth.currentUser.email });

      toast.success(`You are now friends with ${request.from}!`);
      setRequests((prev) => prev.filter((r) => r.from !== request.from));
    } catch (error) {
      console.error("Error accepting friend request:", error);
      toast.error("Failed to accept friend request.");
    }
  };

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
          requests.map((request) => (
            <div key={request.from} className="flex items-center justify-between p-4 bg-white rounded shadow-lg">
              <div className="flex items-center space-x-4">
                <h3 className="text-lg font-semibold">{request.from}</h3>
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
          ))
        )}
      </div>
    </div>
  );
};

export default FriendRequests;
