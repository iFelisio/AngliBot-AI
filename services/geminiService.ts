
import { GoogleGenAI, Type } from "@google/genai";
import { Proficiency } from "../types";

// Always initialize GoogleGenAI with a named parameter using process.env.API_KEY
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const CATEGORIES = ['Animals', 'Travel', 'Food', 'Technology', 'Nature', 'Business', 'Emotions', 'Daily Life', 'Science'];

export const translateText = async (text: string, fromAlbanian: boolean) => {
  const ai = getAI();
  const targetLang = fromAlbanian ? "English" : "Albanian";
  const sourceLang = fromAlbanian ? "Albanian" : "English";

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate the following ${sourceLang} word or sentence to ${targetLang}: "${text}". Only return the translation, no extra text.`,
  });

  return response.text || "Gabim në përkthim.";
};

export const chatWithAI = async (message: string, proficiency: Proficiency = 'Beginner') => {
  const ai = getAI();
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `Ti je një mësues ndihmës i gjuhës Angleze për studentët Shqiptarë. Niveli i studentit është: ${proficiency}. Përshtat gjuhën dhe kompleksitetin tënd sipas këtij niveli. Përgjigju në Shqip kur shpjegon rregulla, por inkurajo përdorimusin të flasë Anglisht. Je miqësor dhe edukativ.`,
    },
  });

  const response = await chat.sendMessage({ message });
  return response.text || "Më vjen keq, nuk munda të përgjigjem.";
};

export const generateWord = async (difficulty: 'easy' | 'medium' | 'hard' = 'medium') => {
  const ai = getAI();
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate one common English word for a learning game. 
    Category: ${category}. 
    Difficulty Level: ${difficulty}. 
    Word length should be between 4 and 8 characters.
    Return ONLY the word in uppercase. Do not repeat previous common words like 'APPLE'.`,
  });
  const word = response.text?.trim().toUpperCase().replace(/[^A-Z]/g, '') || "LEARN";
  return word;
};

export const generateWordPair = async () => {
  const ai = getAI();
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate 4 pairs of English words and their Albanian translations. Category: ${category}. Return the result in a valid JSON array like: [{"en": "Apple", "sq": "Mollë"}, ...]`,
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
  });
  
  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return [{ en: "Sun", sq: "Dielli" }, { en: "Moon", sq: "Hëna" }];
  }
};

export const generateSentence = async (level: Proficiency = 'Beginner') => {
  const ai = getAI();
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Generate one interesting English sentence for a ${level} level student to learn. 
    Category: ${category}. 
    The sentence should be grammatically correct and appropriate.
    Return ONLY the sentence text.`,
  });
  return response.text?.trim() || "The sun is shining today.";
};
