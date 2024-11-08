// src/pages/RemoveFriend.jsx
import React, { useEffect, useState } from "react";
import { db, auth } from "../config/firebase";
import { collection, doc, deleteDoc, onSnapshot } from "firebase/firestore";
import { toast } from "react-toastify";

const RemoveFriend = () => {
  const [friends, setFriends] = useState([]);
  const userId = auth.currentUser?.uid;

  useEffect(() => {
    const fetchFriends = () => {
      const friendsRef = collection(db, "users", userId, "friends");

      const unsubscribe = onSnapshot(friendsRef, (snapshot) => {
        const friendsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setFriends(friendsData);
      });

      return () => unsubscribe();
    };

    fetchFriends();
  }, [userId]);

  const handleRemoveFriend = async (friend) => {
    try {
      const friendRef = doc(db, "users", userId, "friends", friend.id);
      const userRef = doc(db, "users", friend.id, "friends", userId);

      await deleteDoc(friendRef);
      await deleteDoc(userRef);

      toast.success(`Removed ${friend.name} from friends.`);
      setFriends((prev) => prev.filter((user) => user.id !== friend.id));
    } catch (error) {
      console.error("Error removing friend:", error);
      toast.error("Failed to remove friend.");
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Remove Friend</h2>
      {friends.length === 0 ? (
        <p className="text-gray-500">No friends to remove.</p>
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
                  <p className="text-sm text-gray-600">{friend.email}</p>
                </div>
              </div>
              <button
                onClick={() => handleRemoveFriend(friend)}
                className="px-4 py-2 text-white bg-red-600 rounded hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RemoveFriend;
