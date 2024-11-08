// src/pages/Login.jsx
import React, { useState } from "react";
import { auth, db } from "../config/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, updateDoc,onSnapshot,collection, getDocs } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";


const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update user status to "online" in Firestore
      await updateDoc(doc(db, "users", user.uid), { status: "online" });
      
      toast.success("Logged in successfully!");
      // updateFriendStatuses(user.uid);
      navigate("/");
    } catch (error) {
      toast.error("Login failed. Please check your credentials.");
    }
  };

  const updateFriendStatuses = (userId) => {
    // Set up listener on the user's status
    const userStatusRef = doc(db, "users", userId);
    
    onSnapshot(userStatusRef, async (snapshot) => {
      const { status } = snapshot.data();
      
      if (status) {
        // Retrieve friend documents and update their status
        const friendsRef = collection(db, "users", userId, "friends");
        const friendsSnapshot = await getDocs(friendsRef);
  
        friendsSnapshot.forEach((friendDoc) => {
          const friendRef = doc(db, "users", friendDoc.id, "friends", userId);
          updateDoc(friendRef, { status });
        });
      }
    });
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="w-full max-w-md p-8 space-y-4 bg-white rounded shadow-lg">
        <h2 className="text-2xl font-bold text-center">Login</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full px-4 py-2 border rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full px-4 py-2 border rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
            Login
          </button>
        </form>
        <p className="text-center text-gray-600">
          Don’t have an account? <Link to="/register" className="text-blue-600">Register here</Link>.
        </p>
      </div>
    </div>
  );
};

export default Login;
