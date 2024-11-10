import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { db } from '../config/firebase'; // Firestore reference
import { doc, getDoc, updateDoc, setDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { useLocation } from 'react-router-dom';

const VideoCall = () => {
    const location = useLocation();
    const callDocId = location.state?.callId || ""; 
    const isCaller = location.state?.isCaller || false;

    if (!callDocId) {
        console.error("Error: callDocId is undefined. Please provide a valid call ID.");
        return <div>Error: Call ID is missing.</div>;
    }

    const callDocRef = doc(db, "calls", callDocId);

    

    return (
        <div>
            <h1>Video Call</h1>
        </div>   
    );
};

export default VideoCall;
