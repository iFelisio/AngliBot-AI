import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import cors from 'cors';
import { JSONFilePreset } from 'lowdb/node';
import dotenv from 'dotenv';

import { GoogleGenAI } from '@google/genai';

declare module 'express-session' {
  interface SessionData {
    user: any;
  }
}

dotenv.config();

const PORT = 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' });

// Database structure
type Data = {
  users: any[];
  dialogues: any[];
  animations: any[];
  loginLogs: any[];
  suggestions: any[];
};

const defaultData: Data = {
  users: [],
  dialogues: [],
  animations: [],
  loginLogs: [],
  suggestions: [],
};

let db: any = null;
let initPromise: Promise<void> | null = null;

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create uploads directory:', err);
  }
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({ storage });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

async function initialize() {
  if (initPromise) return initPromise;
  
  console.log(`Starting server initialization in ${process.env.NODE_ENV || 'development'} mode...`);
  
  initPromise = (async () => {
    try {
      const dbPath = path.join(process.cwd(), 'db.json');
      console.log(`Loading database from ${dbPath}...`);
      
      // Use JSONFilePreset but with error handling
      db = await JSONFilePreset<Data>(dbPath, defaultData);
      console.log('Database loaded successfully.');
    } catch (err) {
      console.error('CRITICAL: Failed to load database:', err);
      // Fallback to in-memory if file fails to prevent crash
      console.log('Falling back to in-memory database.');
      db = { 
        data: JSON.parse(JSON.stringify(defaultData)), 
        write: async () => { console.log('Mock DB write'); },
        read: async () => { console.log('Mock DB read'); }
      };
    }

    app.use(cors());
    app.use(express.json());
    app.use(cookieParser());
    
    // Request logging
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });

    app.use(
      session({
        secret: process.env.SESSION_SECRET || 'anglibot-secret',
        resave: false,
        saveUninitialized: true,
        cookie: { 
          secure: process.env.NODE_ENV === 'production', 
          sameSite: 'lax',
          httpOnly: true 
        },
      })
    );

    // Health check route - available immediately after middleware
    app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        dbLoaded: !!db, 
        env: process.env.NODE_ENV || 'development',
        time: new Date().toISOString()
      });
    });

    // Serve uploads
    app.use('/uploads', express.static(uploadsDir));

    // Auth Middleware
    const requireAuth = (req: any, res: any, next: any) => {
      if (req.session.user) {
        next();
      } else {
        res.status(401).json({ error: 'Unauthorized' });
      }
    };

    // --- API Routes ---

    // Simple Login
    app.post('/api/auth/login', async (req, res) => {
      const { username, password } = req.body;
      
      if (username === 'admin' && password === '123admin') {
        await db.read();
        let user = db.data.users.find(u => u.email === 'admin@anglibot.ai');

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
          db.data.users.push(user);
        } else {
          user.lastLogin = new Date().toISOString();
        }

        db.data.loginLogs.push({
          id: uuidv4(),
          userId: user.id,
          userName: user.name,
          timestamp: new Date().toISOString()
        });

        await db.write();
        req.session.user = user;
        res.json(user);
      } else {
        res.status(401).json({ error: 'Username ose fjalëkalim i gabuar' });
      }
    });

    app.get('/api/auth/me', (req: any, res) => {
      res.json(req.session.user || null);
    });

    app.post('/api/auth/logout', (req, res) => {
      req.session.destroy(() => {
        res.json({ success: true });
      });
    });

    // Upload
    app.post('/api/upload', upload.single('file'), (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'No file' });
      const url = `${APP_URL}/uploads/${req.file.filename}`;
      res.json({ url });
    });

    // Users
    app.get('/api/users', requireAuth, async (req, res) => {
      await db.read();
      res.json(db.data.users);
    });

    app.delete('/api/users/:id', requireAuth, async (req: any, res) => {
      if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
      await db.read();
      db.data.users = db.data.users.filter(u => u.id !== req.params.id);
      await db.write();
      io.emit('users:updated', db.data.users);
      res.json({ success: true });
    });

    app.patch('/api/users/:id', requireAuth, async (req, res) => {
      await db.read();
      const userIndex = db.data.users.findIndex(u => u.id === req.params.id);
      if (userIndex !== -1) {
        db.data.users[userIndex] = { ...db.data.users[userIndex], ...req.body };
        await db.write();
        io.emit('users:updated', db.data.users);
        res.json(db.data.users[userIndex]);
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    });

    // Dialogues
    app.get('/api/dialogues', async (req, res) => {
      await db.read();
      res.json(db.data.dialogues);
    });

    app.post('/api/dialogues', requireAuth, async (req, res) => {
      await db.read();
      const newDialogue = { ...req.body, id: uuidv4(), createdAt: new Date().toISOString() };
      db.data.dialogues.push(newDialogue);
      await db.write();
      io.emit('dialogues:updated', db.data.dialogues);
      res.json(newDialogue);
    });

    app.delete('/api/dialogues/:id', requireAuth, async (req, res) => {
      await db.read();
      db.data.dialogues = db.data.dialogues.filter(d => d.id !== req.params.id);
      await db.write();
      io.emit('dialogues:updated', db.data.dialogues);
      res.json({ success: true });
    });

    // Animations
    app.get('/api/animations', async (req, res) => {
      await db.read();
      res.json(db.data.animations);
    });

    app.post('/api/animations', requireAuth, async (req, res) => {
      await db.read();
      const newAnim = { ...req.body, id: uuidv4(), createdAt: new Date().toISOString() };
      db.data.animations.push(newAnim);
      await db.write();
      io.emit('animations:updated', db.data.animations);
      res.json(newAnim);
    });

    app.delete('/api/animations/:id', requireAuth, async (req, res) => {
      await db.read();
      db.data.animations = db.data.animations.filter(a => a.id !== req.params.id);
      await db.write();
      io.emit('animations:updated', db.data.animations);
      res.json({ success: true });
    });

    // Suggestions
    app.get('/api/suggestions', async (req, res) => {
      await db.read();
      res.json(db.data.suggestions);
    });

    app.post('/api/suggestions', requireAuth, async (req, res) => {
      await db.read();
      const newSuggestion = { ...req.body, id: uuidv4(), date: new Date().toLocaleDateString() };
      db.data.suggestions.push(newSuggestion);
      await db.write();
      io.emit('suggestions:updated', db.data.suggestions);
      res.json(newSuggestion);
    });

    app.patch('/api/suggestions/:id', requireAuth, async (req, res) => {
      await db.read();
      const index = db.data.suggestions.findIndex(s => s.id === req.params.id);
      if (index !== -1) {
        db.data.suggestions[index] = { ...db.data.suggestions[index], ...req.body };
        await db.write();
        io.emit('suggestions:updated', db.data.suggestions);
        res.json(db.data.suggestions[index]);
      } else {
        res.status(404).json({ error: 'Suggestion not found' });
      }
    });

    // Logs
    app.get('/api/logs', requireAuth, async (req, res) => {
      await db.read();
      res.json(db.data.loginLogs);
    });

    app.delete('/api/logs', requireAuth, async (req, res) => {
      await db.read();
      db.data.loginLogs = [];
      await db.write();
      io.emit('logs:updated', []);
      res.json({ success: true });
    });

    // Config Status
    app.get('/api/config/status', (req, res) => {
      res.json({
        SESSION_SECRET: !!process.env.SESSION_SECRET,
        GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
        APP_URL: !!process.env.APP_URL,
      });
    });

    // --- AI Endpoints ---
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
        const result = await chat.sendMessage(message);
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

    // --- Vite / Static ---

    // API 404
    app.all('/api/*', (req, res) => {
      res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
    });

    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
        root: process.cwd(),
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    // Global Error Handler
    app.use((err: any, req: any, res: any, next: any) => {
      console.error('Unhandled Server Error:', err);
      res.status(500).json({ error: 'A server error occurred', details: err.message });
    });

    // Start listening AFTER middleware is ready
    if (!httpServer.listening) {
      httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`Server process started and listening on port ${PORT}`);
      });
    }

    // Socket.io
    io.on('connection', (socket) => {
      console.log('Client connected');
      socket.on('disconnect', () => console.log('Client disconnected'));
    });
  })();

  return initPromise;
}

// Start the server
initialize().catch(err => {
  console.error('Failed to initialize server:', err);
});

export default async (req: any, res: any) => {
  try {
    await initialize();
    if (typeof app === 'function') {
      return app(req, res);
    }
    throw new Error('Server application not initialized');
  } catch (err: any) {
    console.error('Critical Server Error:', err);
    res.status(500).json({ 
      error: 'A critical server error occurred', 
      details: err.message 
    });
  }
};
