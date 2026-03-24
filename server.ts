import express from 'express';
import { createServer } from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

declare module 'express-session' {
  interface SessionData {
    user: any;
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
let dialogues: any[] = [];
let animations: any[] = [];
let suggestions: any[] = [];
let logs: any[] = [];

// Initialize AI lazily
async function initServices() {
  if (!ai) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' });
  }
}

// Cloudinary configuration
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Multer setup
let storage;
if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
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
const upload = multer({ storage });
const APP_URL = process.env.APP_URL || `http://localhost:3000`;

// Middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'anglibot-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: isVercel, 
      sameSite: 'lax',
      httpOnly: true 
    },
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
const requireAuth = async (req: any, res: any, next: any) => {
  await initServices();
  if (req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
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

app.get('/api/auth/me', async (req: any, res) => {
  await initServices();
  if (!req.session.user) {
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
    }
    req.session.user = user;
  }
  res.json(req.session.user);
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  
  if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
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
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    APP_URL: !!process.env.APP_URL,
    CLOUDINARY: !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME),
  });
});

app.post('/api/ai/chat', requireAuth, async (req, res) => {
  const { message, proficiency, history } = req.body;
  try {
    const chat = ai.chats.create({
      model: 'gemini-3.1-pro-preview',
      config: {
        systemInstruction: `Ti je një mësues ndihmës i gjuhës Angleze për studentët Shqiptarë. Niveli i studentit është: ${proficiency}. Përshtat gjuhën dhe kompleksitetin tënd sipas këtij niveli. Përgjigju në Shqip kur shpjegon rregulla, por inkurajo përdoruesin të flasë Anglisht. Je miqësor, edukativ dhe kreativ në shembujt që jep.`,
      },
      history: history.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      })),
    });
    const result = await chat.sendMessage({ message });
    res.json({ text: result.text });
  } catch (error: any) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/generate', requireAuth, async (req, res) => {
  const { prompt, config, model } = req.body;
  try {
    const result = await ai.models.generateContent({
      model: model || 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config
    });
    res.json({ text: result.text });
  } catch (error: any) {
    console.error('AI Generate Error:', error);
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
}

// Export for Vercel
export default app;
