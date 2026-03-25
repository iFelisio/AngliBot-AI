import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import cookieParser from 'cookie-parser';
import cookieSession from 'cookie-session';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

declare module 'express' {
  interface Request {
    session?: any;
  }
}

dotenv.config();

const app = express();
app.set('trust proxy', 1);

let ai: any = null;

// Vercel specific paths
const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const uploadsDir = isVercel ? '/tmp/uploads' : path.join(process.cwd(), 'public', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create uploads directory:', err);
  }
}

// In-Memory Data Stores (Fallback since MongoDB is removed)
let users: any[] = [];
let dialogues: any[] = [
  {
    id: uuidv4(),
    title: "At the Restaurant",
    content: `Waiter: Good evening. Are you ready to order?
Customer: Yes, I think so. What do you recommend?
Waiter: Our grilled chicken and pasta are very popular.
Customer: I’ll have the grilled chicken, please.
Waiter: Would you like anything to drink?
Customer: Yes, a glass of orange juice, please.
Waiter: Of course.
Customer: How long will the food take?
Waiter: About 15 minutes.
Customer: That’s fine. Thank you.
Waiter: You’re welcome. I’ll bring your order soon.`,
    videoData: "https://drive.google.com/file/d/1pH86K0G8y6Q2yvOmJMRHQSiGompoX97a/view?usp=sharing",
    addedBy: "System",
    level: "Beginner"
  },
  {
    id: uuidv4(),
    title: "At the Shop",
    content: `Shop assistant: Good afternoon. Can I help you?
Customer: Yes, I’m looking for a birthday gift for my sister.
Shop assistant: What kind of things does she like?
Customer: She likes bags and accessories.
Shop assistant: We have some new handbags over here. Would you like to see them?
Customer: Yes, please. That black one looks nice. How much is it?
Shop assistant: It’s 35 euros.
Customer: That’s a bit expensive. Do you have something cheaper?
Shop assistant: Yes, this one is on sale. It’s only 20 euros.
Customer: Perfect! I’ll take it.
Shop assistant: Great. Would you like a gift bag?
Customer: Yes, please. Thank you.`,
    videoData: "https://drive.google.com/file/d/1dgM2iCKdnsJNXlFfBSQQZ8UtlpunsVzU/view?usp=sharing",
    addedBy: "System",
    level: "Beginner"
  },
  {
    id: uuidv4(),
    title: "At the Airport",
    content: `Passenger: Excuse me, where is the check-in desk for the flight to London?
Airport staff: It’s over there, next to gate 12.
Passenger: Thank you. Is the flight on time?
Airport staff: Yes, it is. Boarding will start in about 30 minutes.
Passenger: Great. I also have a suitcase to check in.
Airport staff: No problem. Can I see your passport and ticket, please?
Passenger: Here you are.
Airport staff: Thank you. Your seat is 14A, next to the window.
Passenger: Perfect. What time should I go to the gate?
Airport staff: Please be at the gate at least 20 minutes before departure.
Passenger: Thank you very much.
Airport staff: You’re welcome. Have a nice flight!`,
    videoData: "https://drive.google.com/file/d/1ZOR2gccKUTwnMcQBSJ9YdtvmZfKGnkWA/view?usp=sharing",
    addedBy: "System",
    level: "Intermediate"
  },
  {
    id: uuidv4(),
    title: "Asking for Directions",
    content: `Tourist: Excuse me, could you help me? I’m looking for the city museum.
Local person: Yes, of course. It’s not very far from here.
Tourist: How can I get there?
Local person: Go straight down this street for about five minutes.
Tourist: Okay.
Local person: Then turn right at the traffic lights. The museum will be on your left.
Tourist: Is it near the park?
Local person: Yes, exactly. It’s next to the big park.
Tourist: Great, thank you very much for your help.
Local person: No problem. Enjoy your visit!`,
    videoData: "https://drive.google.com/file/d/1ty_vS75xK94g4gQSvDMnXcTQUomWCYOw/view?usp=sharing",
    addedBy: "System",
    level: "Beginner"
  },
  {
    id: uuidv4(),
    title: "Meeting a Friend",
    content: `Anna: Hi Mark! Long time no see. How have you been?
Mark: Hi Anna! I’ve been good, thanks. What about you?
Anna: I’m fine. I’ve been very busy with school lately.
Mark: Same here. We have a lot of exams this month.
Anna: Yes, it’s quite stressful.
Mark: Do you want to grab a coffee later and study together?
Anna: That’s a great idea. What time?
Mark: Around 5 pm at the café near the library.
Anna: Perfect. See you there!
Mark: See you!`,
    videoData: "https://drive.google.com/file/d/1x55C8VG2NVgR96V_nB0f6fUxudUL1k0h/view?usp=sharing",
    addedBy: "System",
    level: "Intermediate"
  }
];
let animations: any[] = [
  {
    id: uuidv4(),
    title: "Three Little Pigs",
    videoData: "https://drive.google.com/file/d/1L0Zom5-09mYkXEQ90RMAibY74JT9w2SY/view?usp=sharing",
    addedBy: "System"
  },
  {
    id: uuidv4(),
    title: "Red Ridinghood",
    videoData: "https://drive.google.com/file/d/1OQ67xqEC1az3LNANJG1Gs0VKgJWI2q4c/view?usp=sharing",
    addedBy: "System"
  },
  {
    id: uuidv4(),
    title: "The Fox and The Grapes",
    videoData: "https://drive.google.com/file/d/1h1DkfXiAiKuI2-XEws0iWdyPjALWXOgB/view?usp=sharing",
    addedBy: "System"
  }
];
let suggestions: any[] = [];
let logs: any[] = [];

// Initialize AI lazily
async function initServices() {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  if (OPENAI_API_KEY) {
    try {
      ai = new OpenAI({ apiKey: OPENAI_API_KEY });
    } catch (e) {
      console.error("Failed to initialize AI:", e);
    }
  } else {
    console.warn("OPENAI_API_KEY is missing. AI features will be disabled.");
  }
}

// Cloudinary configuration
let cloudinary: any = null;
try {
  // Validate CLOUDINARY_URL before importing to prevent protocol errors
  if (process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_URL.startsWith('cloudinary://')) {
    console.warn("⚠️ Paralajmërim: CLOUDINARY_URL është e pasaktë. Duhet të fillojë me 'cloudinary://'. Fotot do të ruhen lokalisht.");
  } else {
    // We use dynamic import to avoid top-level crash if CLOUDINARY_URL is invalid
    const cloudinaryModule = await import('cloudinary');
    cloudinary = cloudinaryModule.v2;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    }
  }
} catch (e) {
  console.error("Failed to initialize Cloudinary:", e);
}

// Multer setup
let storage;
try {
  if (cloudinary && (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME)) {
    storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'anglibot',
        resource_type: 'auto'
      } as any,
    });
  } else {
    storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadsDir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
      },
    });
  }
} catch (err) {
  console.error("Failed to configure Cloudinary storage:", err);
  // Fallback to disk storage if Cloudinary fails
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  });
}
const upload = multer({ storage });
const APP_URL = process.env.APP_URL || `http://localhost:3000`;

// Middleware
app.set('trust proxy', 1);
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'anglibot-secret'],
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: true,
    sameSite: 'none',
    httpOnly: true 
  })
);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

// API Routes
const populateUser = async (req: any, res: any, next: any) => {
  await initServices();
  const userId = req.headers['x-user-id'];
  if (userId) {
    const user = users.find(u => u.id === userId);
    if (user) {
      req.session = req.session || {};
      req.session.user = user;
      return next();
    }
  }

  if (!req.session?.user) {
    req.session = req.session || {};
    req.session.user = {
      id: 'guest',
      name: 'Vizitor',
      email: 'guest@anglibot.ai',
      picture: 'https://cdn-icons-png.flaticon.com/512/149/149071.png',
      isAdmin: false,
      points: 0,
      streak: 0,
      proficiency: 'Beginner'
    };
  }
  next();
};

const requireAuth = async (req: any, res: any, next: any) => {
  await populateUser(req, res, () => {
    if (req.session?.user && req.session.user.id !== 'guest') {
      return next();
    }
    res.status(401).json({ error: 'Unauthorized: No valid session or x-user-id header provided.' });
  });
};

app.use('/uploads', express.static(uploadsDir));

app.post('/api/auth/login', async (req, res) => {
  await initServices();
  const { username, password } = req.body;

  if (username === 'admin' && password === '123admin') {
    let user = users.find(u => u.email === 'admin@anglibot.ai');

    if (!user) {
      user = {
        id: 'admin-id',
        name: 'Administrator',
        email: 'admin@anglibot.ai',
        picture: 'https://cdn-icons-png.flaticon.com/512/149/149071.png',
        isAdmin: true,
        points: 1000,
        streak: 1,
        lastLogin: new Date().toISOString(),
        badges: ['Admin'],
        proficiency: 'Advanced',
        goal: 'Manage Platform',
      };
      users.push(user);
    } else {
      user.lastLogin = new Date().toISOString();
    }

    logs.push({
      id: uuidv4(),
      userId: user.id,
      userName: user.name,
      timestamp: new Date().toISOString()
    });

    req.session.user = user;
    res.json(user);
  } else {
    res.status(401).json({ error: 'Username ose fjalëkalim i gabuar' });
  }
});

app.get('/api/auth/me', populateUser, (req: any, res) => {
  res.json(req.session.user);
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.post('/api/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Multer error', details: err.message });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Make sure the field name is "file".' });
  
  if (cloudinary && (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME)) {
    res.json({ url: req.file.path });
  } else {
    const url = `${APP_URL}/uploads/${req.file.filename}`;
    res.json({ url });
  }
});

app.get('/api/users', requireAuth, async (req, res) => {
  await initServices();
  res.json(users);
});

app.delete('/api/users/:id', requireAuth, async (req: any, res) => {
  await initServices();
  if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  users = users.filter(u => u.id !== req.params.id);
  res.json({ success: true });
});

app.patch('/api/users/:id', requireAuth, async (req, res) => {
  await initServices();
  const index = users.findIndex(u => u.id === req.params.id);
  if (index !== -1) {
    users[index] = { ...users[index], ...req.body };
    res.json(users[index]);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.get('/api/dialogues', async (req, res) => {
  await initServices();
  res.json(dialogues);
});

app.post('/api/dialogues', requireAuth, async (req, res) => {
  await initServices();
  const newDialogue = { ...req.body, id: uuidv4(), createdAt: new Date().toISOString() };
  dialogues.push(newDialogue);
  res.json(newDialogue);
});

app.delete('/api/dialogues/:id', requireAuth, async (req, res) => {
  await initServices();
  dialogues = dialogues.filter(d => d.id !== req.params.id);
  res.json({ success: true });
});

app.get('/api/animations', async (req, res) => {
  await initServices();
  res.json(animations);
});

app.post('/api/animations', requireAuth, async (req, res) => {
  await initServices();
  const newAnim = { ...req.body, id: uuidv4(), createdAt: new Date().toISOString() };
  animations.push(newAnim);
  res.json(newAnim);
});

app.delete('/api/animations/:id', requireAuth, async (req, res) => {
  await initServices();
  animations = animations.filter(a => a.id !== req.params.id);
  res.json({ success: true });
});

app.get('/api/suggestions', async (req, res) => {
  await initServices();
  res.json(suggestions);
});

app.post('/api/suggestions', requireAuth, async (req, res) => {
  await initServices();
  const newSuggestion = { ...req.body, id: uuidv4(), date: new Date().toLocaleDateString() };
  suggestions.push(newSuggestion);
  res.json(newSuggestion);
});

app.patch('/api/suggestions/:id', requireAuth, async (req, res) => {
  await initServices();
  const index = suggestions.findIndex(s => s.id === req.params.id);
  if (index !== -1) {
    suggestions[index] = { ...suggestions[index], ...req.body };
    res.json(suggestions[index]);
  } else {
    res.status(404).json({ error: 'Suggestion not found' });
  }
});

app.get('/api/logs', requireAuth, async (req, res) => {
  await initServices();
  res.json(logs);
});

app.delete('/api/logs', requireAuth, async (req, res) => {
  await initServices();
  logs = [];
  res.json({ success: true });
});

app.get('/api/config/status', (req, res) => {
  res.json({
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    OPENAI_API_KEY: !!(process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY),
    APP_URL: !!process.env.APP_URL,
    CLOUDINARY: !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME),
  });
});

// AI Proxy Routes
app.post('/api/ai/translate', async (req, res) => {
  try {
    await initServices();
    if (!ai) return res.status(503).json({ error: 'AI service not configured' });
    
    const { text, fromAlbanian } = req.body;
    const targetLang = fromAlbanian ? "English" : "Albanian";
    const sourceLang = fromAlbanian ? "Albanian" : "English";
    
    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You are a translator. Translate the following ${sourceLang} word or sentence to ${targetLang}. Only return the translation, no extra text.` },
        { role: "user", content: text }
      ],
    });
    res.json({ translation: response.choices[0].message.content || "Gabim në përkthim." });
  } catch (error: any) {
    console.error("Server Translation Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    await initServices();
    if (!ai) return res.status(503).json({ error: 'AI service not configured' });
    
    const { message, proficiency, history } = req.body;
    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: `Ti je një mësues ndihmës i gjuhës Angleze për studentët Shqiptarë. Niveli i studentit është: ${proficiency}. Përshtat gjuhën dhe kompleksitetin tënd sipas këtij niveli. Përgjigju në Shqip kur shpjegon rregulla, por inkurajo përdoruesin të flasë Anglisht. Je miqësor, edukativ dhe kreativ në shembujt që jep.` 
        },
        ...history.map((msg: any) => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text
        })),
        { role: "user", content: message }
      ],
    });
    res.json({ response: response.choices[0].message.content || "Gabim në bisedë." });
  } catch (error: any) {
    console.error("Server Chat Error:", error);
    res.status(500).json({ error: error.message });
  }
});

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

app.post('/api/ai/generate-word', async (req, res) => {
  try {
    await initServices();
    if (!ai) return res.status(503).json({ error: 'AI service not configured' });
    
    const { difficulty, exactLength, recentWords = [] } = req.body;
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const lengthConstraint = exactLength ? `EXACTLY ${exactLength} characters long.` : `4-10 characters long.`;
    const avoidList = recentWords.length > 0 ? `CRITICAL: DO NOT use any of these words: ${recentWords.join(', ')}.` : '';

    const prompt = `Generate one UNIQUE, interesting English word for a learning game. 
      Category: ${category}. 
      Difficulty Level: ${difficulty}. 
      Word length: ${lengthConstraint}
      ${avoidList}
      The word should be educational and commonly used in the specified category. 
      Do NOT pick very common starter words. Be creative and diverse.
      Return ONLY a JSON object: {"word": "THEWORD"}`;

    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Server Generate Word Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/generate-word-pair', async (req, res) => {
  try {
    await initServices();
    if (!ai) return res.status(503).json({ error: 'AI service not configured' });
    
    const { recentPairs = [] } = req.body;
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const avoidList = recentPairs.length > 0 ? `CRITICAL: DO NOT use these English words: ${recentPairs.join(', ')}.` : '';
    
    const prompt = `Generate 4 UNIQUE and diverse pairs of English words and their Albanian translations. 
      Category: ${category}. 
      ${avoidList}
      Ensure the words are relevant to the category and useful for learners. 
      Return ONLY a JSON array of objects: [{"en": "word", "sq": "fjala"}, ...]`;

    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Server Generate Word Pair Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/generate-sentence', async (req, res) => {
  try {
    await initServices();
    if (!ai) return res.status(503).json({ error: 'AI service not configured' });
    
    const { level, recentSentences = [] } = req.body;
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const avoidList = recentSentences.length > 0 ? `CRITICAL: DO NOT use these exact sentences: ${recentSentences.join(' | ')}.` : '';
    
    const prompt = `Generate one UNIQUE, natural English sentence for a ${level} level student. 
      Category: ${category}.
      ${avoidList}
      The sentence should be grammatically correct and use vocabulary appropriate for the level. 
      Be creative and avoid clichés.
      Return ONLY a JSON object: {"sentence": "The generated sentence"}`;

    const response = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });
    
    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Server Generate Sentence Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.all('/api/*all', (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
});

// Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

// Vite Dev Server / Static Files
if (!isVercel) {
  const PORT = 3000;
  import('vite').then(({ createServer: createViteServer }) => {
    createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      root: process.cwd(),
    }).then((vite) => {
      app.use(vite.middlewares);
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    });
  }).catch(err => {
    console.error('Failed to load vite:', err);
  });
}

// Export for Vercel
export default app;
