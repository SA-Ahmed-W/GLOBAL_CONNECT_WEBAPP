import React, { useEffect, useState, useCallback } from "react";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

function LocalTranslationAndSend({ callDocId, isCaller, peerConnection }) {
  const [isDataChannelReady, setIsDataChannelReady] = useState(false);
  const [translations, setTranslations] = useState([]);
  const [inputLang, setInputLang] = useState(null);
  const [outputLang, setOutputLang] = useState(null);
  const [inputLangCode, setInputLangCode] = useState(null);
  const [outputLangCode, setOutputLangCode] = useState(null);

  const callDocRef = useMemo(() => doc(db, "calls", callDocId), [callDocId]);

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

  const getTranslationLanguage = async () => {
    try {
      const docSnapshot = await getDoc(callDocRef);

      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const inputLanguage = isCaller
          ? data.inputLanguage
          : data.outputLanguage;
        const outputLanguage = isCaller
          ? data.outputLanguage
          : data.inputLanguage;

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

  useEffect(() => {
    if (!peerConnection || !peerConnection.dataChannel) {
      console.error("DataChannel is not available during initialization.");
      return;
    }
    getTranslationLanguage();
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
    async(text) => {
      // const apiUrl = "https://gc-translate.onrender.com/api/v1/translate";
      // const responseAxios = await axios.post(
      //   apiUrl,
      //   {
      //     text: text,
      //     input_language_code: inputLangCode,
      //     output_language_code: outputLangCode,
      //   },
      //   {
      //     headers: {
      //       Authorization: `Bearer ${import.meta.env.VITE_GC_API_TRANSLATE_SECRET_KEY}`,
      //       "Content-Type": "application/json",
      //     },
      //   }
      // );

      // const translatedText = responseAxios.data.translated_text;

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
    recognition.lang = inputLangCode || "en";// Adjust language as needed
    recognition.continuous = true;

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      console.log("Speech Transcript:", transcript);
      sendText(transcript);
    };

    recognition.onerror = (event) =>
      console.error("Speech recognition error:", event.error);
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
