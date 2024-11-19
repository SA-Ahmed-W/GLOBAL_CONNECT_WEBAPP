import React, { useEffect, useState } from "react";

function RemoteStreamAudioEquilizer({ audioStream }) {
  const [audioStrength, setAudioStrength] = useState(0); // Audio strength percentage (0 to 100)

  useEffect(() => {
    if (!audioStream) return;

    // Set up AudioContext and AnalyserNode
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(audioStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256; // Determines granularity

    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const calculateAudioStrength = () => {
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length; // Average amplitude
      const strength = Math.min((average / 255) * 100, 100); // Convert to percentage (0-100)
      setAudioStrength(strength);
      requestAnimationFrame(calculateAudioStrength); // Loop
    };

    calculateAudioStrength();

    return () => {
      audioContext.close();
    };
  }, [audioStream]);

  return (
    <div className="w-full bg-gray-900 p-2 rounded-md shadow-md">
      <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
        {/* Dynamic audio bar */}
        <div
          className={`h-full transition-all ${
            audioStrength < 30
              ? "bg-green-500"
              : audioStrength < 70
              ? "bg-yellow-500"
              : "bg-red-500"
          }`}
          style={{ width: `${audioStrength}%` }}
        ></div>
      </div>
      {/* Optional: Display percentage or description */}
      <p className="text-sm text-gray-300 mt-2 text-center">
        Audio Strength: {Math.round(audioStrength)}%
      </p>
    </div>
  );
}

export default RemoteStreamAudioEquilizer;
