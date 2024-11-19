import React, { useEffect, useState, useMemo, useCallback } from 'react';
import axios from 'axios';
import { db } from "../config/firebase";
import { doc, getDoc } from "firebase/firestore";

function TranslationArea({ callDocId, isCaller }) {
    // Firestore document reference memoized
    const callDocRef = useMemo(() => doc(db, "calls", callDocId), [callDocId]);

    const [inputLang, setInputLang] = useState(null);
    const [outputLang, setOutputLang] = useState(null);
    const [inputLangCode, setInputLangCode] = useState(null);
    const [outputLangCode, setOutputLangCode] = useState(null);

    // Language-to-code mapping
    const languageCodeMap = useMemo(() => ({
        HINDI: "hi",
        ENGLISH: "en",
        KANNADA: "kn",
        MALAYALAM: "ml",
    }), []);

    // Function to map language name to its code
    const getLanguageCode = useCallback((language) => {
        return languageCodeMap[language.toUpperCase()] || null;
    }, [languageCodeMap]);

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
    const translate = useCallback(async (text) => {
        const options = {
            method: 'POST',
            url: 'https://google-translate-api9.p.rapidapi.com/translate/mini',
            headers: {
                'x-rapidapi-key': import.meta.env.VITE_RAPID_API_KEY,
                'x-rapidapi-host': import.meta.env.VITE_RAPID_API_HOST,
                'Content-Type': 'application/json',
            },
            data: {
                input: text,
                inputLanguage: inputLangCode,
                outputLanguage: outputLangCode,
            },
        };

        try {
            const response = await axios.request(options);
            console.log(response.data); // Handle the translated response
        } catch (error) {
            console.error("Translation API error:", error);
        }
    }, [inputLangCode, outputLangCode]);

    return (
        <>
            <div>TranslationArea</div>
            <h1>Input Language: {inputLang}</h1>
            <h1>Output Language: {outputLang}</h1>
        </>
    );
}

export default TranslationArea;
