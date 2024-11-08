// src/pages/Register.jsx
import React, { useState } from "react";
import { auth, storage, db } from "../config/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { setDoc, doc } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profilePic, setProfilePic] = useState(null);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      let profilePicUrl = "";
      if (profilePic) {
        const storageRef = ref(storage, `profilePics/${user.uid}`);
        await uploadBytes(storageRef, profilePic);
        profilePicUrl = await getDownloadURL(storageRef);
      }

      await updateProfile(user, {
        displayName: name,
        photoURL: profilePicUrl,
      });

      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        profilePic: profilePicUrl,
        status: "online",
      });

      toast.success("Registration successful! Please log in.");
      navigate("/login");
    } catch (error) {
      toast.error("Registration failed. Please try again.");
    }
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="w-full max-w-md p-8 space-y-4 bg-white rounded shadow-lg">
        <h2 className="text-2xl font-bold text-center">Register</h2>
        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="text"
            placeholder="Name"
            className="w-full px-4 py-2 border rounded"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
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
          <input
            type="file"
            onChange={(e) => setProfilePic(e.target.files[0])}
            className="w-full"
          />
          <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
            Register
          </button>
        </form>
        <p className="text-center text-gray-600">
          Already have an account? <Link to="/login" className="text-blue-600">Login here</Link>.
        </p>
      </div>
    </div>
  );
};

export default Register;
