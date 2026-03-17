
import { GoogleGenAI, Type } from "@google/genai";
import { Proficiency } from "../types";

// Always initialize GoogleGenAI with a named parameter
const getAI = () => {
  let key = '';
  
  // 1. Provon process.env (Injektuar nga Vite define ose mjedisi)
  try {
    if (typeof process !== 'undefined' && process.env) {
      key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY;
    }
  } catch (e) {}

  // 2. Provon import.meta.env (Mënyra standarde e Vite)
  if (!key || key === 'undefined') {
    try {
      const metaEnv = (import.meta as any).env;
      if (metaEnv) {
        key = metaEnv.VITE_GEMINI_API_KEY || metaEnv.GEMINI_API_KEY || metaEnv.VITE_API_KEY;
      }
    } catch (e) {}
  }

  // 3. Pastrim i vlerave string "undefined" ose "null" që vijnë nga env
  if (key === 'undefined' || key === 'null' || !key) {
    key = '';
  }

  if (!key) {
    console.error("AngliBot: API Key nuk u gjet. Ju lutem shtoni GEMINI_API_KEY te Settings -> Secrets.");
  }
  
  return new GoogleGenAI({ apiKey: key || 'NO_KEY' });
};

const CATEGORIES = [
  'Animals', 'Travel', 'Food', 'Technology', 'Nature', 'Business', 'Emotions', 
  'Daily Life', 'Science', 'Sports', 'Music', 'History', 'Space', 'Art', 'Clothing',
  'Health', 'Education', 'Weather', 'Hobbies', 'Transportation', 'Architecture',
  'Literature', 'Movies', 'Geography', 'Politics', 'Economy', 'Social Media',
  'Environment', 'Fashion', 'Cooking', 'Photography', 'Philosophy', 'Psychology',
  'Gardening', 'DIY', 'Fitness', 'Yoga', 'Meditation', 'Mindfulness', 'Self-Care',
  'Productivity', 'Time Management', 'Leadership', 'Entrepreneurship', 'Marketing',
  'Design', 'Programming', 'Data Science', 'AI', 'Robotics', 'Cybersecurity'
];

const recentWords: string[] = [];
const recentPairs: string[] = [];
const recentSentences: string[] = [];

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
  ]);
};

export const translateText = async (text: string, fromAlbanian: boolean) => {
  const models = ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const ai = getAI();
      const targetLang = fromAlbanian ? "English" : "Albanian";
      const sourceLang = fromAlbanian ? "Albanian" : "English";

      const response = await withTimeout(ai.models.generateContent({
        model: model,
        contents: `Translate the following ${sourceLang} word or sentence to ${targetLang}: "${text}". Only return the translation, no extra text. Ensure the translation is accurate and natural.`,
      }));

      if (response.text) return response.text;
    } catch (error: any) {
      console.error(`Translation failed with model ${model}:`, error);
      lastError = error;
      
      // Nëse gabimi është API Key i pavlefshëm, nuk ka kuptim të provojmë modele të tjera
      const msg = error?.message || error?.toString() || "";
      if (msg.includes("API_KEY_INVALID") || msg.includes("403") || msg.includes("API key not valid")) {
        break;
      }
    }
  }

  console.error("All models failed in translateText:", lastError);
  const errorMsg = lastError?.message || lastError?.toString() || "";
  
  if (errorMsg.includes("API_KEY_INVALID") || errorMsg.includes("403") || errorMsg.includes("API key not valid")) {
    return "Gabim: API Key i pavlefshëm. Ju lutem kontrolloni Settings -> Secrets.";
  }
  
  if (errorMsg.includes("quota") || errorMsg.includes("429")) {
    return "Gabim: Keni tejkaluar limitin e kërkesave (Quota exceeded). Provoni përsëri më vonë.";
  }

  return `Gabim në përkthim. ${errorMsg ? `(${errorMsg})` : "Kontrolloni lidhjen ose API Key."}`;
};

export const chatWithAI = async (message: string, proficiency: Proficiency = 'Beginner', history: {role: string, text: string}[] = []) => {
  const models = ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const ai = getAI();
      const formattedHistory = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      }));

      const chat = ai.chats.create({
        model: model,
        config: {
          systemInstruction: `Ti je një mësues ndihmës i gjuhës Angleze për studentët Shqiptarë. Niveli i studentit është: ${proficiency}. Përshtat gjuhën dhe kompleksitetin tënd sipas këtij niveli. Përgjigju në Shqip kur shpjegon rregulla, por inkurajo përdorimusin të flasë Anglisht. Je miqësor, edukativ dhe kreativ në shembujt që jep.`,
        },
        history: formattedHistory,
      });

      const response = await withTimeout(chat.sendMessage({ message }));
      return response.text || "Më vjen keq, nuk munda të përgjigjem.";
    } catch (error: any) {
      console.error(`Model ${model} failed in chatWithAI:`, error);
      lastError = error;
      
      const msg = error?.message || error?.toString() || "";
      if (msg.includes("API_KEY_INVALID") || msg.includes("403") || msg.includes("API key not valid")) {
        break;
      }
    }
  }
  
  console.error("All models failed in chatWithAI:", lastError);
  const errorMsg = lastError?.message || lastError?.toString() || "";
  
  if (errorMsg.includes("API_KEY_INVALID") || errorMsg.includes("403") || errorMsg.includes("API key not valid")) {
    return "Gabim: API Key i pavlefshëm. Ju lutem kontrolloni Settings -> Secrets.";
  }
  
  if (errorMsg.includes("quota") || errorMsg.includes("429")) {
    return "Gabim: Keni tejkaluar limitin e kërkesave (Quota exceeded). Provoni përsëri më vonë.";
  }

  return "Më vjen keq, shërbimi AI është momentalisht i padisponueshëm. " + (errorMsg ? `(${errorMsg})` : "Ju lutem kontrolloni API Key.");
};

export const processContent = async (content: string, task: string, isComplex: boolean = false) => {
  const models = isComplex ? ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'] : ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const ai = getAI();
      const response = await withTimeout(ai.models.generateContent({
        model: model,
        contents: `Task: ${task}\n\nContent: ${content}\n\nProvide a high-quality response based on the task and content.`,
      }));
      return response.text || "Nuk u gjenerua asnjë rezultat.";
    } catch (error) {
      console.warn(`Model ${model} failed in processContent, trying next...`, error);
      lastError = error;
    }
  }
  
  console.error("All models failed in processContent:", lastError);
  const errorMsg = lastError?.message || "";
  return `Gabim gjatë procesimit me AI. ${errorMsg ? `(${errorMsg})` : ""}`;
};

export const generateWord = async (difficulty: 'easy' | 'medium' | 'hard' = 'medium', exactLength?: number) => {
  try {
    const ai = getAI();
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    
    const lengthConstraint = exactLength ? `EXACTLY ${exactLength} characters long.` : `4-10 characters long.`;
    const avoidList = recentWords.length > 0 ? `CRITICAL: DO NOT use any of these words: ${recentWords.join(', ')}.` : '';

    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate one UNIQUE, interesting English word for a learning game. 
      Category: ${category}. 
      Difficulty Level: ${difficulty}. 
      Word length: ${lengthConstraint}
      ${avoidList}
      The word should be educational and commonly used in the specified category. 
      Do NOT pick very common starter words. Be creative and diverse.`,
      config: {
        temperature: 1.5,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING, description: "The generated word in uppercase" }
          },
          required: ["word"]
        }
      }
    }));
    
    let word = "";
    try {
      const parsed = JSON.parse(response.text || "{}");
      word = parsed.word?.trim().toUpperCase().replace(/[^A-Z]/g, '') || "";
    } catch (e) {
      word = response.text?.trim().toUpperCase().replace(/[^A-Z]/g, '') || "";
    }
    
    if (!word) word = exactLength === 5 ? "STUDY" : "LEARN";
    
    if (word && word.length > 0) {
      recentWords.push(word);
      if (recentWords.length > 50) recentWords.shift();
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
    const avoidList = recentPairs.length > 0 ? `CRITICAL: DO NOT use these English words: ${recentPairs.join(', ')}.` : '';
    
    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate 4 UNIQUE and diverse pairs of English words and their Albanian translations. 
      Category: ${category}. 
      ${avoidList}
      Ensure the words are relevant to the category and useful for learners. 
      Return as JSON array: [{"en": "word", "sq": "fjala"}, ...]`,
      config: {
        temperature: 1.5,
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
        if (recentPairs.length > 60) recentPairs.splice(0, recentPairs.length - 60);
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
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const avoidList = recentSentences.length > 0 ? `CRITICAL: DO NOT use these exact sentences: ${recentSentences.join(' | ')}.` : '';
    
    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate one UNIQUE, natural English sentence for a ${level} level student. 
      Category: ${category}.
      ${avoidList}
      The sentence should be grammatically correct and use vocabulary appropriate for the level. 
      Be creative and avoid clichés.`,
      config: {
        temperature: 1.5,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sentence: { type: Type.STRING, description: "The generated sentence" }
          },
          required: ["sentence"]
        }
      }
    }));
    
    let sentence = "";
    try {
      const parsed = JSON.parse(response.text || "{}");
      sentence = parsed.sentence?.trim() || "";
    } catch (e) {
      sentence = response.text?.trim() || "";
    }
    
    if (!sentence) sentence = "Learning a new language opens many doors.";
    
    if (sentence) {
      recentSentences.push(sentence);
      if (recentSentences.length > 20) recentSentences.shift();
    }
    
    return sentence;
  } catch (error) {
    console.error("Error generating sentence:", error);
    return "Learning a new language opens many doors.";
  }
};
