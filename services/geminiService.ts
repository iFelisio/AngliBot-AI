
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Proficiency } from "../types";

// Always initialize GoogleGenAI with a named parameter
const getAI = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('AI is not configured. Please set VITE_GEMINI_API_KEY.');
  }
  return new GoogleGenAI({ apiKey });
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

export const translateText = async (text: string, fromAlbanian: boolean) => {
  try {
    const ai = getAI();
    const targetLang = fromAlbanian ? "English" : "Albanian";
    const sourceLang = fromAlbanian ? "Albanian" : "English";
    const prompt = `Translate the following ${sourceLang} word or sentence to ${targetLang}: "${text}". Only return the translation, no extra text. Ensure the translation is accurate and natural.`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Gabim në përkthim.";
  } catch (error: any) {
    console.error("Translation Error:", error);
    return `Gabim në përkthim: ${error.message}`;
  }
};

export const chatWithAI = async (message: string, proficiency: Proficiency = 'Beginner', history: {role: string, text: string}[] = []) => {
  try {
    const ai = getAI();
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: `Ti je një mësues ndihmës i gjuhës Angleze për studentët Shqiptarë. Niveli i studentit është: ${proficiency}. Përshtat gjuhën dhe kompleksitetin tënd sipas këtij niveli. Përgjigju në Shqip kur shpjegon rregulla, por inkurajo përdoruesin të flasë Anglisht. Je miqësor, edukativ dhe kreativ në shembujt që jep.`,
      },
      history: history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      })),
    });

    const response = await chat.sendMessage({ message });
    return response.text || "Gabim në bisedë.";
  } catch (error: any) {
    console.error("Chat Error:", error);
    return `Gabim: Shërbimi AI është momentalisht i padisponueshëm. (${error.message})`;
  }
};

export const processContent = async (content: string, task: string, isComplex: boolean = false) => {
  try {
    const ai = getAI();
    const prompt = `Task: ${task}\n\nContent: ${content}\n\nProvide a high-quality response based on the task and content.`;
    const response = await ai.models.generateContent({
      model: isComplex ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Gabim gjatë procesimit.";
  } catch (error: any) {
    console.error("Process Content Error:", error);
    return `Gabim gjatë procesimit me AI. (${error.message})`;
  }
};

export const generateWord = async (difficulty: 'easy' | 'medium' | 'hard' = 'medium', exactLength?: number) => {
  try {
    const ai = getAI();
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const lengthConstraint = exactLength ? `EXACTLY ${exactLength} characters long.` : `4-10 characters long.`;
    const avoidList = recentWords.length > 0 ? `CRITICAL: DO NOT use any of these words: ${recentWords.join(', ')}.` : '';

    const prompt = `Generate one UNIQUE, interesting English word for a learning game. 
      Category: ${category}. 
      Difficulty Level: ${difficulty}. 
      Word length: ${lengthConstraint}
      ${avoidList}
      The word should be educational and commonly used in the specified category. 
      Do NOT pick very common starter words. Be creative and diverse.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
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
    });

    let word = "";
    try {
      const parsed = JSON.parse(response.text || "{}");
      word = parsed.word?.trim().toUpperCase().replace(/[^A-Z]/g, '') || "";
    } catch (e) {
      word = response.text?.trim().toUpperCase().replace(/[^A-Z]/g, '') || "";
    }
    
    if (!word) word = exactLength === 5 ? "STUDY" : "LEARN";
    if (word) {
      recentWords.push(word);
      if (recentWords.length > 50) recentWords.shift();
    }
    return word;
  } catch (error) {
    console.error("Generate Word Error:", error);
    return exactLength === 5 ? "STUDY" : "LEARN";
  }
};

export const generateWordPair = async () => {
  try {
    const ai = getAI();
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const avoidList = recentPairs.length > 0 ? `CRITICAL: DO NOT use these English words: ${recentPairs.join(', ')}.` : '';
    
    const prompt = `Generate 4 UNIQUE and diverse pairs of English words and their Albanian translations. 
      Category: ${category}. 
      ${avoidList}
      Ensure the words are relevant to the category and useful for learners. 
      Return as JSON array: [{"en": "word", "sq": "fjala"}, ...]`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
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
    });
    
    try {
      const parsed = JSON.parse(response.text || "[]");
      if (Array.isArray(parsed)) {
        parsed.forEach(p => { if (p.en) recentPairs.push(p.en); });
        if (recentPairs.length > 60) recentPairs.splice(0, recentPairs.length - 60);
      }
      return parsed;
    } catch (e) {
      return [{ en: "Knowledge", sq: "Dituria" }, { en: "Challenge", sq: "Sfidë" }];
    }
  } catch (error) {
    console.error("Generate Word Pair Error:", error);
    return [{ en: "Knowledge", sq: "Dituria" }, { en: "Challenge", sq: "Sfidë" }];
  }
};

export const generateSentence = async (level: Proficiency = 'Beginner') => {
  try {
    const ai = getAI();
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const avoidList = recentSentences.length > 0 ? `CRITICAL: DO NOT use these exact sentences: ${recentSentences.join(' | ')}.` : '';
    
    const prompt = `Generate one UNIQUE, natural English sentence for a ${level} level student. 
      Category: ${category}.
      ${avoidList}
      The sentence should be grammatically correct and use vocabulary appropriate for the level. 
      Be creative and avoid clichés.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
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
    });
    
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
    console.error("Generate Sentence Error:", error);
    return "Learning a new language opens many doors.";
  }
};
