import React, { useEffect, useState } from "react";

function RemoteReceiveAndDisplay({ peerConnection }) {
  const [receivedTexts, setReceivedTexts] = useState([]);

  useEffect(() => {
    if (!peerConnection || !peerConnection.dataChannel) return;

    const dataChannel = peerConnection.dataChannel;

    dataChannel.onmessage = (event) => {
      const receivedText = event.data;
      setReceivedTexts((prev) => [...prev, receivedText]);
    };

    dataChannel.onerror = (error) => console.error("DataChannel error:", error);
  }, [peerConnection]);

  return (
    <div className="p-4 border border-gray-300 rounded-lg shadow-md bg-white">
      <h1 className="text-xl font-bold mb-4">Received Translations</h1>
      <div className="mt-4">
        {receivedTexts.map((text, index) => (
          <p key={index} className="text-gray-700">{text}</p>
        ))}
      </div>
    </div>
  );
}

export default RemoteReceiveAndDisplay;
