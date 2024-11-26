import React, { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import { db } from "../config/firebase";
import { doc, getDoc } from "firebase/firestore";
import {translate as Translate} from 'google-translate-api-x';

// Speech Recognition API setup
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

function TranslationArea({ callDocId, isCaller, remoteAudioStream, remoteStream }) {
  // Firestore document reference memoized
  const callDocRef = useMemo(() => doc(db, "calls", callDocId), [callDocId]);

  const [inputLang, setInputLang] = useState(null);
  const [outputLang, setOutputLang] = useState(null);
  const [inputLangCode, setInputLangCode] = useState(null);
  const [outputLangCode, setOutputLangCode] = useState(null);
  const [translations, setTranslations] = useState([]);

  // Language-to-code mapping
  const languageCodeMap = useMemo(
    () => ({
      HINDI: "hi",
      ENGLISH: "en",
      KANNADA: "kn",
      MALAYALAM: "ml",
    }),
    []
  );

  // Function to map language name to its code
  const getLanguageCode = useCallback(
    (language) => {
      return languageCodeMap[language.toUpperCase()] || null;
    },
    [languageCodeMap]
  );

  // Fetch translation settings from Firestore
  useEffect(() => {
    const getTranslationLanguage = async () => {
      try {
        const docSnapshot = await getDoc(callDocRef);

        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          const inputLanguage = isCaller ? data.inputLanguage : data.outputLanguage;
          const outputLanguage = isCaller ? data.outputLanguage : data.inputLanguage;

          setInputLang(inputLanguage);
          setOutputLang(outputLanguage);
          setInputLangCode(getLanguageCode(inputLanguage));
          setOutputLangCode(getLanguageCode(outputLanguage));
        } else {
          console.error("Document does not exist");
        }
      } catch (error) {
        console.error("Error fetching document: ", error);
      }
    };

    getTranslationLanguage();
  }, [callDocRef, isCaller, getLanguageCode]);

  // Speech Recognition Setup
  useEffect(() => {
    if (!remoteStream) return;

    const recognition = new SpeechRecognition();
    recognition.lang = inputLangCode || "en"; // Default to English if not set
    recognition.continuous = true;

    // Extract audio tracks from the remote stream
    const audioTracks = remoteStream.getAudioTracks();
    if (audioTracks.length > 0) {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
      const destination = audioContext.createMediaStreamDestination();

      // Connect audio stream to SpeechRecognition
      source.connect(destination);

      // Start SpeechRecognition
      recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript;

        // Translate the latest transcript
        translate(transcript);
      };

      recognition.onerror = (event) => console.error("Speech recognition error:", event.error);
      recognition.start();

      return () => {
        recognition.stop();
        audioContext.close();
      };
    }
  }, [remoteStream, inputLangCode]);

  // Translation function
  const translate = useCallback(
    async (text) => {
      try {
        const response = await Translate(text,{from : inputLangCode,to: outputLang,autoCorrect: true})
        const translatedText = response.text; // Ensure 'output' aligns with new API's response structure
  
        // Add new translation to the list
        setTranslations((prev) => [
          { text: translatedText, isLatest: true },
          ...prev.map((t) => ({ ...t, isLatest: false })), // Mark previous texts as not latest
        ]);
      } catch (error) {
        console.error("Translation API error:", error);
      }
    },
    [inputLangCode, outputLangCode]
  );


  return (
    <div className="p-4 border border-gray-300 rounded-lg shadow-md bg-white">
      <h1 className="text-xl font-bold mb-4">Translation Area</h1>

      {/* Grid layout for Input/Output Language and Translations */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-2 sm:grid-cols-1">
        {/* Input and Output Language Display */}
        <div>
          <h2 className="text-lg">
            Input Language: <span className="font-semibold">{inputLang || "Loading..."}</span>
          </h2>
          <h2 className="text-lg mt-2">
            Output Language: <span className="font-semibold">{outputLang || "Loading..."}</span>
          </h2>
        </div>

        {/* Translations */}
        <div className="mt-4 p-2 border border-gray-400 rounded-lg bg-gray-50">
          {translations.map((t, index) => (
            <p
              key={index}
              className={`mt-1 ${
                t.isLatest ? "text-black font-bold" : "text-gray-500"
              }`}
            >
              {t.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TranslationArea;
