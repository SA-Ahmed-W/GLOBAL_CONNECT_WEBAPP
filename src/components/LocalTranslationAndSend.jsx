import React, { useEffect, useState, useCallback } from "react";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function LocalTranslationAndSend({ peerConnection }) {
  const [isDataChannelReady, setIsDataChannelReady] = useState(false);

  useEffect(() => {
    if (!peerConnection || !peerConnection.dataChannel) {
      console.error("DataChannel is not available during initialization.");
      return;
    }

    const dataChannel = peerConnection.dataChannel;

    dataChannel.onopen = () => {
      console.log("DataChannel opened.");
      setIsDataChannelReady(true);
    };

    dataChannel.onerror = (error) => console.error("DataChannel error:", error);
    dataChannel.onclose = () => {
      console.log("DataChannel closed.");
      setIsDataChannelReady(false);
    };

    return () => {
      dataChannel.onopen = null;
      dataChannel.onclose = null;
      dataChannel.onerror = null;
    };
  }, [peerConnection]);

  const sendText = useCallback(
    (text) => {
      if (peerConnection && peerConnection.dataChannel && isDataChannelReady) {
        console.log("Sending text:", text);
        peerConnection.dataChannel.send(text);
      } else {
        console.error("DataChannel is not ready for sending.");
      }
    },
    [peerConnection, isDataChannelReady]
  );

  useEffect(() => {
    const recognition = new SpeechRecognition();
    recognition.lang = "en"; // Adjust language as needed
    recognition.continuous = true;

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      console.log("Speech Transcript:", transcript);
      sendText(transcript);
    };

    recognition.onerror = (event) => console.error("Speech recognition error:", event.error);
    recognition.start();

    return () => {
      recognition.stop();
    };
  }, [sendText]);

  return (
    <div className="p-4 border border-gray-300 rounded-lg shadow-md bg-white">
      <h1 className="text-xl font-bold mb-4">Local Translation and Sending</h1>
      <p>DataChannel Status: {isDataChannelReady ? "Ready" : "Not Ready"}</p>
    </div>
  );
}

export default LocalTranslationAndSend;
