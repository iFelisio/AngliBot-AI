
import { GoogleGenAI, Type } from "@google/genai";
import { Proficiency } from "../types";

// Always initialize GoogleGenAI with a named parameter using process.env.GEMINI_API_KEY
const getAI = () => {
  const key = process.env.GEMINI_API_KEY || process.env.API_KEY || import.meta.env.VITE_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!key) {
    console.error("Mungon çelësi i API-së (API Key). Ju lutem shtoni GEMINI_API_KEY në Netlify.");
  }
  return new GoogleGenAI({ apiKey: key });
};

const CATEGORIES = [
  'Animals', 'Travel', 'Food', 'Technology', 'Nature', 'Business', 'Emotions', 
  'Daily Life', 'Science', 'Sports', 'Music', 'History', 'Space', 'Art', 'Clothing'
];

const recentWords: string[] = [];
const recentPairs: string[] = [];
const recentSentences: string[] = [];

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number = 8000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
  ]);
};

export const translateText = async (text: string, fromAlbanian: boolean) => {
  try {
    const ai = getAI();
    const targetLang = fromAlbanian ? "English" : "Albanian";
    const sourceLang = fromAlbanian ? "Albanian" : "English";

    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Translate the following ${sourceLang} word or sentence to ${targetLang}: "${text}". Only return the translation, no extra text.`,
    }));

    return response.text || "Gabim në përkthim.";
  } catch (error) {
    console.error("Error translating text:", error);
    return "Gabim në përkthim.";
  }
};

export const chatWithAI = async (message: string, proficiency: Proficiency = 'Beginner') => {
  try {
    const ai = getAI();
    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: `Ti je një mësues ndihmës i gjuhës Angleze për studentët Shqiptarë. Niveli i studentit është: ${proficiency}. Përshtat gjuhën dhe kompleksitetin tënd sipas këtij niveli. Përgjigju në Shqip kur shpjegon rregulla, por inkurajo përdorimusin të flasë Anglisht. Je miqësor dhe edukativ.`,
      },
    });

    const response = await withTimeout(chat.sendMessage({ message }));
    return response.text || "Më vjen keq, nuk munda të përgjigjem.";
  } catch (error) {
    console.error("Error chatting with AI:", error);
    return "Më vjen keq, nuk munda të përgjigjem.";
  }
};

export const generateWord = async (difficulty: 'easy' | 'medium' | 'hard' = 'medium', exactLength?: number) => {
  try {
    const ai = getAI();
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    
    const lengthConstraint = exactLength ? `EXACTLY ${exactLength} characters long.` : `4-8 chars.`;
    const avoidList = recentWords.length > 0 ? `DO NOT use any of these words: ${recentWords.join(', ')}.` : '';

    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate one UNIQUE English word for a learning game. 
      Category: ${category}. 
      Difficulty Level: ${difficulty}. 
      Word length: ${lengthConstraint}
      ${avoidList}
      CRITICAL: Do NOT pick common starter words like Apple or Banana. Pick something interesting and educational.
      Return ONLY the word in uppercase.`,
      config: {
        temperature: 1.2,
      }
    }));
    const word = response.text?.trim().toUpperCase().replace(/[^A-Z]/g, '') || (exactLength === 5 ? "STUDY" : "LEARN");
    
    if (word && word.length > 0) {
      recentWords.push(word);
      if (recentWords.length > 30) recentWords.shift();
    }
    
    return word;
  } catch (error) {
    console.error("Error generating word:", error);
    return exactLength === 5 ? "STUDY" : "LEARN";
  }
};

export const generateWordPair = async () => {
  try {
    const ai = getAI();
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const avoidList = recentPairs.length > 0 ? `DO NOT use these English words: ${recentPairs.join(', ')}.` : '';
    
    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate 4 RANDOM pairs of English words and Albanian translations. 
      Category: ${category}. 
      ${avoidList}
      Return as JSON array: [{"en": "word", "sq": "fjala"}, ...]`,
      config: {
        temperature: 1.2,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              en: { type: Type.STRING },
              sq: { type: Type.STRING }
            },
            required: ["en", "sq"]
          }
        }
      }
    }));
    
    try {
      const parsed = JSON.parse(response.text || "[]");
      if (Array.isArray(parsed)) {
        parsed.forEach(p => {
          if (p.en) recentPairs.push(p.en);
        });
        if (recentPairs.length > 40) recentPairs.splice(0, recentPairs.length - 40);
      }
      return parsed;
    } catch (e) {
      return [
        { en: "Knowledge", sq: "Dituria" }, 
        { en: "Challenge", sq: "Sfidë" },
        { en: "Success", sq: "Sukses" },
        { en: "Learning", sq: "Të nxënit" }
      ];
    }
  } catch (error) {
    console.error("Error generating word pair:", error);
    return [
      { en: "Knowledge", sq: "Dituria" }, 
      { en: "Challenge", sq: "Sfidë" },
      { en: "Success", sq: "Sukses" },
      { en: "Learning", sq: "Të nxënit" }
    ];
  }
};

export const generateSentence = async (level: Proficiency = 'Beginner') => {
  try {
    const ai = getAI();
    const avoidList = recentSentences.length > 0 ? `DO NOT use these exact sentences: ${recentSentences.join(' | ')}.` : '';
    
    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate one random English sentence for a ${level} student. 
      ${avoidList}
      Avoid repeating common phrases. Return ONLY the sentence text.`,
      config: {
        temperature: 1.2,
      }
    }));
    const sentence = response.text?.trim() || "Learning a new language opens many doors.";
    
    if (sentence) {
      recentSentences.push(sentence);
      if (recentSentences.length > 10) recentSentences.shift();
    }
    
    return sentence;
  } catch (error) {
    console.error("Error generating sentence:", error);
    return "Learning a new language opens many doors.";
  }
};
