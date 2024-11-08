// src/App.jsx
import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./config/firebase";
import Navbar from "./components/Navbar";
import FriendsList from "./pages/FriendsList";
import AddFriend from "./pages/AddFriend";
import RemoveFriend from "./pages/RemoveFriend";
import Login from "./pages/Login";
import Register from "./pages/Register";
import BeforeCall from "./components/BeforeCall"
import CallSession from "./pages/CallSession"
import VideoCall from "./pages/VideoCall"
import Loader from "./components/Loader"

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (<>
    <Loader/>
    </>)
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        {/* Conditionally render Navbar if user is logged in */}
        {/* {user && <Navbar />} */}
        <Navbar />

        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" /> : <Register />} />

          {/* Protected Routes */}
          <Route path="/" element={user ? <FriendsList /> : <Navigate to="/login" />} />
          <Route path="/add-friend" element={user ? <AddFriend /> : <Navigate to="/login" />} />
          <Route path="/remove-friend" element={user ? <RemoveFriend /> : <Navigate to="/login" />} />
          <Route path="/before/call/:callid" element={user ? <BeforeCall /> : <Navigate to="/login" />} />
          <Route path="/call/session/:friendId" element={user ? <CallSession /> : <Navigate to="/login" />} />
          <Route path="/video-call" element={user ? <VideoCall /> : <Navigate to="/login" />}/>


        </Routes>
      </div>
    </Router>
  );
};

export default App;
