// src/pages/AddFriend.jsx
import React, { useState, useEffect } from "react";
import { db, auth } from "../config/firebase";
import { collection, query, where, getDocs, setDoc, deleteDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";

const AddFriend = () => {
  const [searchName, setSearchName] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const userId = auth.currentUser?.uid;

  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const friendsRef = collection(db, "users", userId, "friends");
        const friendsSnapshot = await getDocs(friendsRef);
        const friendIds = friendsSnapshot.docs.map((doc) => doc.id);
        setFriends(friendIds);
      } catch (error) {
        console.error("Error fetching friends:", error);
      }
    };
    
    if (userId) {
      fetchFriends();
    }
  }, [userId]);

  const handleSearch = async () => {
    if (searchName.length <= 0 || !searchName) return;

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("name", ">=", searchName), where("name", "<=", searchName + "\uf8ff"));
      const querySnapshot = await getDocs(q);
      const results = [];

      querySnapshot.forEach((doc) => {
        if (doc.id !== userId) {  // Ensure user can't add themselves
          results.push({ id: doc.id, ...doc.data() });
        }
      });
      setSearchResults(results);
    } catch (error) {
      console.error("Error searching for users:", error);
      toast.error("Failed to search for users.");
    }
  };

  const handleAddFriend = async (friend) => {
    try {
      const friendRef = doc(db, "users", userId, "friends", friend.id);
      const userRef = doc(db, "users", friend.id, "friends", userId);

      const userFriendfDoc = doc(db, "users",userId)
      const userRefDoc = doc(db, "users",friend.id)

      // await setDoc(friendRef, { name: friend.name, email: friend.email, profilePic: friend.profilePic || "" });
      await setDoc(friendRef, {
        name: friend.name,
        email: friend.email,
        profilePic: friend.profilePic || "",
        status: userRefDoc || "null"  // Assuming a default value if status is unavailable
      });
      await setDoc(userRef, { name: auth.currentUser.displayName, email: auth.currentUser.email, profilePic: auth.currentUser.photoURL || "",status : userFriendfDoc || "null" });

      toast.success(`${friend.name} added as a friend!`);
      setFriends((prev) => [...prev, friend.id]); // Update friends list locally
    } catch (error) {
      console.error("Error adding friend:", error);
      toast.error("Failed to add friend.");
    }
  };

  const handleRemoveFriend = async (friend) => {
    try {
      const friendRef = doc(db, "users", userId, "friends", friend.id);
      const userRef = doc(db, "users", friend.id, "friends", userId);

      await deleteDoc(friendRef);
      await deleteDoc(userRef);

      toast.success(`${friend.name} removed from friends.`);
      setFriends((prev) => prev.filter((id) => id !== friend.id)); // Update friends list locally
    } catch (error) {
      console.error("Error removing friend:", error);
      toast.error("Failed to remove friend.");
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Add Friend</h2>
      <div className="flex space-x-4">
        <input
          type="text"
          placeholder="Enter name to search"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          className="p-2 border rounded w-full"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700"
        >
          Search
        </button>
      </div>
      <div className="space-y-4 mt-4">
        {searchResults.length === 0 ? (
          <p className="text-gray-500">No users found.</p>
        ) : (
          searchResults.map((user) => (
            <div key={user.id} className="flex items-center justify-between p-4 bg-white rounded shadow-lg">
              <div className="flex items-center space-x-4">
                <img
                  src={user.profilePic || "/default-avatar.png"}
                  alt="Profile"
                  className="w-12 h-12 rounded-full"
                />
                <div>
                  <h3 className="text-lg font-semibold">{user.name}</h3>
                  <p className="text-sm text-gray-600">{user.email}</p>
                </div>
              </div>
              {friends.includes(user.id) ? (
                <button
                  onClick={() => handleRemoveFriend(user)}
                  className="px-4 py-2 text-white bg-red-600 rounded hover:bg-red-700"
                >
                  Remove
                </button>
              ) : (
                <button
                  onClick={() => handleAddFriend(user)}
                  className="px-4 py-2 text-white bg-green-600 rounded hover:bg-green-700"
                >
                  Add
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AddFriend;
