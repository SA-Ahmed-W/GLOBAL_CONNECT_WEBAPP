import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, NavLink } from "react-router-dom";
import { auth, db } from "../config/firebase"; // Firebase auth and Firestore import
import { signOut, onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";

const Navbar = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [user, setUser] = useState(null); // Track user state manually
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  useEffect(() => {
    // Set up an auth state listener
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser); // Update user state on auth change
    });
    return () => unsubscribe(); // Clean up on component unmount
  }, []);

  // Close dropdown if clicking outside of it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false); // Close dropdown if clicking outside
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    if (user) {
      // Update user status to "offline" in Firestore before signing out
      await updateDoc(doc(db, "users", user.uid), { status: "offline" });
      await signOut(auth);
      navigate("/login"); // Redirect to login after logout
      setDropdownOpen(false); // Close dropdown after logout
    }
  };

  return (
    <nav className="bg-blue-600 p-4 flex justify-between items-center">
      <div className="text-white text-lg font-semibold">
        <Link to="/">GlobalConnect CRAFTED BY ME AND GPT</Link>
      </div>

      {user ? (
        <div className="flex items-center space-x-4">
          <NavLink to="/" className="text-white hidden md:inline">Friends</NavLink>
          <NavLink to="/add-friend" className="text-white hidden md:inline">Add Friend</NavLink>
          <NavLink to="/remove-friend" className="text-white hidden md:inline">Remove Friend</NavLink>

          <div className="relative" ref={dropdownRef}>
            <img
              src={user.photoURL || "default-profile.jpg"}
              alt="Profile"
              className="w-8 h-8 rounded-full cursor-pointer"
              onClick={() => setDropdownOpen(!dropdownOpen)}
            />
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-50">
                <div className="p-4 border-b">
                  <p className="text-sm font-medium">{user.displayName}</p>
                  <p className="text-xs text-gray-500 mb-2">{user.email}</p>
                  <p className="text-xs text-gray-400 break-words">{user.uid}</p>
                </div>
                <Link
                  to="/"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setDropdownOpen(false)}
                >
                  Friends
                </Link>
                <Link
                  to="/add-friend"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setDropdownOpen(false)}
                >
                  Add Friend
                </Link>
                <Link
                  to="/remove-friend"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setDropdownOpen(false)}
                >
                  Remove Friend
                </Link>
                {/* <div className="border-b"> */}
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-sm bg-red-600 rounded-b-lg text-white font-semibold hover:bg-red-700"
                >
                  Logout
                </button>
                {/* </div> */}

              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <Link to="/login" className="text-white">Login</Link>
          <Link to="/register" className="text-white mx-3">Register</Link>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
