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

      toast.error(`Removed ${friend.name} from friends.`);
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
        <p className="text-gray-500 text-center">No friends to remove.</p>
      ) : (
        <div className="grid gap-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {friends.map((friend) => (
            <div
              key={friend.id}
              className="flex flex-col bg-white border shadow-sm rounded-lg max-w-xs"
            >
              {/* Profile Picture */}
              <img
                className="w-full h-40 object-cover rounded-t-lg"
                src={friend.profilePic || "/default-avatar.png"}
                alt={friend.name}
              />

              {/* Friend Details */}
              <div className="p-4">
                <h3 className="text-lg font-semibold text-black text-center">{friend.name}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400 text-center">{friend.email}</p>

                {/* Action Buttons */}
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => handleRemoveFriend(friend)}
                    className="py-2 px-4 text-sm font-medium rounded-md border border-transparent bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:bg-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RemoveFriend;
