import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { doc } from "firebase/firestore";
import { db } from "../config/firebase";

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function LocalTranslationAndSend({ callDocId,isCaller, peerConnection }) {
  const [translations, setTranslations] = useState([]);
  const callDocRef = useMemo(() => doc(db, "calls", callDocId), [callDocId]);
  const [inputLang, setInputLang] = useState(null);
  const [outputLang, setOutputLang] = useState(null);
  const [inputLangCode, setInputLangCode] = useState(null);
  const [outputLangCode, setOutputLangCode] = useState(null);

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
  

  const translateText = useCallback(async (text) => {
    try {
      const apiUrl = "https://gc-translate.onrender.com/api/v1/translate";
      const response = await axios.post(apiUrl, {
        text,
        input_language_code: inputLangCode,
        output_language_code: outputLangCode,
      }, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_GC_API_TRANSLATE_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const translatedText = response.data.translated_text;
      setTranslations((prev) => [...prev, translatedText]);

      // Send translated text to the remote peer via WebRTC DataChannel
      if (peerConnection && peerConnection.dataChannel) {
        peerConnection.dataChannel.send(translatedText);
      }
    } catch (error) {
      console.error("Translation error:", error.message);
    }
  }, [inputLangCode, outputLangCode, peerConnection]);

  useEffect(() => {
    const recognition = new SpeechRecognition();
    recognition.lang = inputLangCode || "en";
    recognition.continuous = true;

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      translateText(transcript);
    };

    recognition.onerror = (event) => console.error("Speech recognition error:", event.error);
    recognition.start();

    return () => {
      recognition.stop();
    };
  }, [inputLangCode, translateText]);

  return (
    <div className="p-4 border border-gray-300 rounded-lg shadow-md bg-white">
      <h1 className="text-xl font-bold mb-4">Local Translation and Sending</h1>
      <div className="mt-4">
        {translations.map((t, index) => (
          <p key={index} className="text-gray-700">{t}</p>
        ))}
      </div>
    </div>
  );
}

export default LocalTranslationAndSend;
