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
import { GoogleGenAI } from '@google/genai';
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
let dialogues: any[] = [];
let animations: any[] = [];
let suggestions: any[] = [];
let logs: any[] = [];

// Initialize AI lazily
async function initServices() {
  const GEMINI_API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (GEMINI_API_KEY) {
    try {
      ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    } catch (e) {
      console.error("Failed to initialize AI:", e);
    }
  } else {
    console.warn("API_KEY or GEMINI_API_KEY is missing. AI features will be disabled.");
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
    GEMINI_API_KEY: !!(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY),
    APP_URL: !!process.env.APP_URL,
    CLOUDINARY: !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME),
  });
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
