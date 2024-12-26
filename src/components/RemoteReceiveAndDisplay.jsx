import React, { useEffect, useState } from "react";

function RemoteReceiveAndDisplay({ peerConnection }) {
  const [receivedTexts, setReceivedTexts] = useState([]);
  const [isDataChannelReady, setIsDataChannelReady] = useState(false);

  useEffect(() => {
    if (!peerConnection) {
      console.error("PeerConnection is not available.");
      return;
    }

    let dataChannel = peerConnection.dataChannel;

    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      console.log("DataChannel received:", dataChannel.label);

      dataChannel.onopen = () => {
        console.log("DataChannel opened.");
        setIsDataChannelReady(true);
      };

      dataChannel.onmessage = (event) => {
        console.log("Message received:", event.data);
        setReceivedTexts((prev) => [
          { text: event.data, isLatest: true },
          ...prev.map((t) => ({ ...t, isLatest: false })), // Mark previous texts as not latest
        ]);
      };

      dataChannel.onerror = (error) => console.error("DataChannel error:", error);
      dataChannel.onclose = () => {
        console.log("DataChannel closed.");
        setIsDataChannelReady(false);
      };
    };

    return () => {
      if (dataChannel) {
        dataChannel.onopen = null;
        dataChannel.onmessage = null;
        dataChannel.onerror = null;
        dataChannel.onclose = null;
      }
    };
  }, [peerConnection]);

  return (
    <div className="p-4 border border-gray-300 rounded-lg shadow-md bg-white">
      <h1 className="text-xl font-bold mb-4">Received Translations</h1>
      <p>DataChannel Status: {isDataChannelReady ? "Ready" : "Not Ready"}</p>
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
