import React, { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import { db } from "../config/firebase";
import { doc, getDoc } from "firebase/firestore";

// Speech Recognition API setup
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

function TranslationArea({ callDocId, isCaller, remoteAudioStream,remoteStream }) {
  // Firestore document reference memoized
  const callDocRef = useMemo(() => doc(db, "calls", callDocId), [callDocId]);

  const [inputLang, setInputLang] = useState(null);
  const [outputLang, setOutputLang] = useState(null);
  const [inputLangCode, setInputLangCode] = useState(null);
  const [outputLangCode, setOutputLangCode] = useState(null);
  const [translations, setTranslations] = useState([]); // Array of translations for display

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

  // Translation function
  const translate = useCallback(
    async (text) => {
      const options = {
        method: "POST",
        url: "https://google-translate-api9.p.rapidapi.com/translate/mini",
        headers: {
          "x-rapidapi-key": import.meta.env.VITE_RAPID_API_KEY,
          "x-rapidapi-host": import.meta.env.VITE_RAPID_API_HOST,
          "Content-Type": "application/json",
        },
        data: {
          input: text,
          inputLanguage: inputLangCode,
          outputLanguage: outputLangCode,
        },
      };

      try {
        const response = await axios.request(options);
        const translatedText = response.data.translation;

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

  // Process audio to text
  const processAudioStream = useCallback(() => {
    if (!remoteAudioStream) return;

    const audioTracks = remoteAudioStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error("No audio tracks available in remote stream");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = inputLangCode; // Set the language for transcription
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      console.log("Transcribed text:", transcript);

      // Call translate function with transcribed text
      translate(transcript);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
    };

    recognition.start();
  }, [remoteAudioStream, inputLangCode, translate]);

  // Start processing audio stream when remoteAudioStream is available
  useEffect(() => {
    processAudioStream();
  }, [remoteAudioStream, processAudioStream]);

  return (
    <div className="p-4 border border-gray-300 rounded-lg shadow-md bg-white">
  <h1 className="text-xl font-bold mb-4">Translation Area</h1>

  {/* Desktop: Grid layout for Input/Output Language and Textarea */}
  <div className="grid grid-cols-2 gap-4 md:grid-cols-2 sm:grid-cols-1">
    {/* Left Section: Input and Output Language */}
    <div>
      <h2 className="text-lg">
        Input Language: <span className="font-semibold">{inputLang}</span>
      </h2>
      <h2 className="text-lg mt-2">
        Output Language: <span className="font-semibold">{outputLang}</span>
      </h2>
    </div>

    {/* Right Section: Translation Textarea */}
    <div>
      <textarea
        readOnly
        className="w-full p-4 border border-gray-400 rounded-lg text-gray-800 bg-gray-50"
        rows="8"
        value={translations.map((t) => t.text).join("\n")}
        style={{ resize: "none" }}
      ></textarea>
    </div>
  </div>

  {/* Mobile View: Stack Input/Output Language Below Textarea */}
  <div className="block md:hidden mt-4">
    <h2 className="text-lg">
      Input Language: <span className="font-semibold">{inputLang}</span>
    </h2>
    <h2 className="text-lg mt-2">
      Output Language: <span className="font-semibold">{outputLang}</span>
    </h2>
  </div>

  {/* Translations List */}
  <div className="mt-2">
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

  );
}

export default TranslationArea;
