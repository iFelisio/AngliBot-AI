
import { Proficiency } from "../types";

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
    const response = await fetch('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, fromAlbanian })
    });
    
    if (!response.ok) throw new Error('Translation failed');
    const data = await response.json();
    return data.translation || "Gabim në përkthim.";
  } catch (error: any) {
    console.error("Translation Error:", error);
    return `Gabim në përkthim: ${error.message}`;
  }
};

export const chatWithAI = async (message: string, proficiency: Proficiency = 'Beginner', history: {role: string, text: string}[] = []) => {
  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, proficiency, history })
    });
    
    if (!response.ok) throw new Error('Chat failed');
    const data = await response.json();
    return data.response || "Gabim në bisedë.";
  } catch (error: any) {
    console.error("Chat Error:", error);
    return `Gabim: Shërbimi AI është momentalisht i padisponueshëm. (${error.message})`;
  }
};

export const processContent = async (content: string, task: string, isComplex: boolean = false) => {
  // This one wasn't proxied yet, but let's keep it simple for now or add it if needed
  // For now, let's just return a placeholder or implement it if it's used
  return "Procesimi nuk është i disponueshëm momentalisht.";
};

export const generateWord = async (difficulty: 'easy' | 'medium' | 'hard' = 'medium', exactLength?: number) => {
  try {
    const response = await fetch('/api/ai/generate-word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty, exactLength, recentWords })
    });
    
    if (!response.ok) throw new Error('Word generation failed');
    const parsed = await response.json();
    
    let word = parsed.word?.trim().toUpperCase().replace(/[^A-Z]/g, '') || "";
    
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
    const response = await fetch('/api/ai/generate-word-pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recentPairs })
    });
    
    if (!response.ok) throw new Error('Word pair generation failed');
    const parsed = await response.json();
    
    const pairs = Array.isArray(parsed) ? parsed : (parsed.pairs || parsed.data || []);
    
    if (Array.isArray(pairs)) {
      pairs.forEach((p: any) => { if (p.en) recentPairs.push(p.en); });
      if (recentPairs.length > 60) recentPairs.splice(0, recentPairs.length - 60);
      return pairs;
    }
    return [{ en: "Knowledge", sq: "Dituria" }, { en: "Challenge", sq: "Sfidë" }];
  } catch (error) {
    console.error("Generate Word Pair Error:", error);
    return [{ en: "Knowledge", sq: "Dituria" }, { en: "Challenge", sq: "Sfidë" }];
  }
};

export const generateSentence = async (level: Proficiency = 'Beginner') => {
  try {
    const response = await fetch('/api/ai/generate-sentence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, recentSentences })
    });
    
    if (!response.ok) throw new Error('Sentence generation failed');
    const parsed = await response.json();
    
    let sentence = parsed.sentence?.trim() || "";
    
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

