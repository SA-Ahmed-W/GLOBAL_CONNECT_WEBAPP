import React, { useState } from "react";
import { auth, db } from "../config/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { setDoc, doc } from "firebase/firestore";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = (e) => {
    e.preventDefault();
    setLoading(true); // Disable the button

    const registerPromise = async () => {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Generate a random profile picture URL
      const profilePicUrl = `https://picsum.photos/200`;

      await updateProfile(user, {
        displayName: name,
        photoURL: profilePicUrl,
      });

      await setDoc(doc(db, "users", user.uid), {
        name,
        email,
        profilePic: profilePicUrl,
        status: "online",
        password
      });

      navigate("/login"); // Redirect to login on success
    };

    toast.promise(registerPromise(), {
      pending: "Registering your account...",
      success: "Registration successful! 👌",
      error: "Registration failed. Please try again 🤯",
    })
      .catch(() => {
        setLoading(false); // Re-enable the button on failure
      })
      .finally(() => {
        setLoading(false); // Ensure button is re-enabled
      });
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
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 rounded text-white ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {loading ? "Registering..." : "Register"}
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
