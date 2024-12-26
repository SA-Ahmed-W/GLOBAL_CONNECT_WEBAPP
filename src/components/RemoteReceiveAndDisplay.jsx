import React, { useEffect, useState } from "react";

function RemoteReceiveAndDisplay({ peerConnection }) {
  const [receivedTexts, setReceivedTexts] = useState([]);

  useEffect(() => {
    if (!peerConnection || !peerConnection.dataChannel) return;

    const dataChannel = peerConnection.dataChannel;

    // Log when dataChannel is opened
    dataChannel.onopen = () => {
      console.log("DataChannel opened. REC");
    };

    dataChannel.onmessage = (event) => {
      console.log("Received message:", event.data);
      const receivedText = event.data;

      // Add new translation to the list, marking it as the latest
      setReceivedTexts((prev) => [
        { text: receivedText, isLatest: true },
        ...prev.map((t) => ({ ...t, isLatest: false })), // Mark previous texts as not latest
      ]);
    };

    dataChannel.onerror = (error) => console.error("DataChannel error RR:", error);
    dataChannel.onclose = () => console.log("DataChannel closed. RR");

  }, [peerConnection]);

  return (
    <div className="p-4 border border-gray-300 rounded-lg shadow-md bg-white">
      <h1 className="text-xl font-bold mb-4">Received Translations</h1>
      {/* Translations */}
      <div className="mt-4 p-2 border border-gray-400 rounded-lg bg-gray-50">
        {receivedTexts.map((t, index) => (
          <p
            key={index}
            className={`mt-1 ${t.isLatest ? "text-black font-bold" : "text-gray-500"}`}
          >
            {t.text}
          </p>
        ))}
      </div>
    </div>
  );
}

export default RemoteReceiveAndDisplay;
