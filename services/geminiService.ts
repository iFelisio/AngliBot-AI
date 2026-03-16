
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
    // Use current time as a seed to force randomness in the LLM
    const seed = Date.now();
    
    const lengthConstraint = exactLength ? `EXACTLY ${exactLength} characters long.` : `4-8 chars.`;

    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `[Seed: ${seed}] Generate one UNIQUE English word for a learning game. 
      Category: ${category}. 
      Difficulty Level: ${difficulty}. 
      Word length: ${lengthConstraint}
      CRITICAL: Do NOT pick common starter words like Apple or Banana. Pick something interesting and educational.
      Return ONLY the word in uppercase.`,
    }));
    const word = response.text?.trim().toUpperCase().replace(/[^A-Z]/g, '') || (exactLength === 5 ? "STUDY" : "LEARN");
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
    const seed = Date.now();
    
    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `[Seed: ${seed}] Generate 4 RANDOM pairs of English words and Albanian translations. 
      Category: ${category}. 
      Return as JSON array: [{"en": "word", "sq": "fjala"}, ...]`,
      config: {
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
      return JSON.parse(response.text || "[]");
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
    const seed = Date.now();
    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `[Seed: ${seed}] Generate one random English sentence for a ${level} student. 
      Avoid repeating common phrases. Return ONLY the sentence text.`,
    }));
    return response.text?.trim() || "Learning a new language opens many doors.";
  } catch (error) {
    console.error("Error generating sentence:", error);
    return "Learning a new language opens many doors.";
  }
};
