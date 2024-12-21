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

  const handleSendRequest = async (friend) => {
    try {
      const requestRef = doc(db, "friendRequests", userId + "_" + friend.id);

      await setDoc(requestRef, {
        from: userId,
        to: friend.id,
        status: "pending"
      });

      toast.success(`Friend request sent to ${friend.name}!`);
    } catch (error) {
      console.error("Error sending friend request:", error);
      toast.error("Failed to send friend request.");
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
                <span className="text-green-600">Already Friends</span>
              ) : (
                <button
                  onClick={() => handleSendRequest(user)}
                  className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  Send Request
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
