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
let isDbReady = false;

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
app.set('trust proxy', 1); // Required for secure cookies behind proxy

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

// Middleware that waits for DB if needed (optional, but safer)
const waitForDb = async (req: any, res: any, next: any) => {
  if (!isDbReady && !req.url.startsWith('/api/health')) {
    // If DB is not ready, we can either wait or return 503
    // For now, let's just proceed and let individual routes handle null db
  }
  next();
};

async function startServer() {
  console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode...`);

  // 1. Basic Middleware
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

  // 2. Health check route
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      dbReady: isDbReady, 
      env: process.env.NODE_ENV || 'development',
      time: new Date().toISOString()
    });
  });

  // 3. API Routes
  const requireAuth = (req: any, res: any, next: any) => {
    if (req.session.user) {
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };

  // Serve uploads
  app.use('/uploads', express.static(uploadsDir));

  // Auth
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!isDbReady) return res.status(503).json({ error: 'Server is still initializing database' });

    if (username === 'admin' && password === '123admin') {
      await db.read();
      let user = db.data.users.find((u: any) => u.email === 'admin@anglibot.ai');

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
    if (!isDbReady) return res.status(503).json({ error: 'DB not ready' });
    await db.read();
    res.json(db.data.users);
  });

  app.delete('/api/users/:id', requireAuth, async (req: any, res) => {
    if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
    if (!isDbReady) return res.status(503).json({ error: 'DB not ready' });
    await db.read();
    db.data.users = db.data.users.filter((u: any) => u.id !== req.params.id);
    await db.write();
    io.emit('users:updated', db.data.users);
    res.json({ success: true });
  });

  app.patch('/api/users/:id', requireAuth, async (req, res) => {
    if (!isDbReady) return res.status(503).json({ error: 'DB not ready' });
    await db.read();
    const userIndex = db.data.users.findIndex((u: any) => u.id === req.params.id);
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
    if (!isDbReady) return res.json([]);
    await db.read();
    res.json(db.data.dialogues);
  });

  app.post('/api/dialogues', requireAuth, async (req, res) => {
    if (!isDbReady) return res.status(503).json({ error: 'DB not ready' });
    await db.read();
    const newDialogue = { ...req.body, id: uuidv4(), createdAt: new Date().toISOString() };
    db.data.dialogues.push(newDialogue);
    await db.write();
    io.emit('dialogues:updated', db.data.dialogues);
    res.json(newDialogue);
  });

  app.delete('/api/dialogues/:id', requireAuth, async (req, res) => {
    if (!isDbReady) return res.status(503).json({ error: 'DB not ready' });
    await db.read();
    db.data.dialogues = db.data.dialogues.filter((d: any) => d.id !== req.params.id);
    await db.write();
    io.emit('dialogues:updated', db.data.dialogues);
    res.json({ success: true });
  });

  // Animations
  app.get('/api/animations', async (req, res) => {
    if (!isDbReady) return res.json([]);
    await db.read();
    res.json(db.data.animations);
  });

  app.post('/api/animations', requireAuth, async (req, res) => {
    if (!isDbReady) return res.status(503).json({ error: 'DB not ready' });
    await db.read();
    const newAnim = { ...req.body, id: uuidv4(), createdAt: new Date().toISOString() };
    db.data.animations.push(newAnim);
    await db.write();
    io.emit('animations:updated', db.data.animations);
    res.json(newAnim);
  });

  app.delete('/api/animations/:id', requireAuth, async (req, res) => {
    if (!isDbReady) return res.status(503).json({ error: 'DB not ready' });
    await db.read();
    db.data.animations = db.data.animations.filter((a: any) => a.id !== req.params.id);
    await db.write();
    io.emit('animations:updated', db.data.animations);
    res.json({ success: true });
  });

  // Suggestions
  app.get('/api/suggestions', async (req, res) => {
    if (!isDbReady) return res.json([]);
    await db.read();
    res.json(db.data.suggestions);
  });

  app.post('/api/suggestions', requireAuth, async (req, res) => {
    if (!isDbReady) return res.status(503).json({ error: 'DB not ready' });
    await db.read();
    const newSuggestion = { ...req.body, id: uuidv4(), date: new Date().toLocaleDateString() };
    db.data.suggestions.push(newSuggestion);
    await db.write();
    io.emit('suggestions:updated', db.data.suggestions);
    res.json(newSuggestion);
  });

  app.patch('/api/suggestions/:id', requireAuth, async (req, res) => {
    if (!isDbReady) return res.status(503).json({ error: 'DB not ready' });
    await db.read();
    const index = db.data.suggestions.findIndex((s: any) => s.id === req.params.id);
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
    if (!isDbReady) return res.json([]);
    await db.read();
    res.json(db.data.loginLogs);
  });

  app.delete('/api/logs', requireAuth, async (req, res) => {
    if (!isDbReady) return res.status(503).json({ error: 'DB not ready' });
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

  // AI
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

  // API 404
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // 4. Static / Vite
  if (process.env.NODE_ENV === 'development') {
    console.log('Initializing Vite dev server...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      root: process.cwd(),
    });
    app.use(vite.middlewares);
  } else {
    console.log('Serving static files from dist...');
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*all', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.warn('WARNING: dist directory not found. Frontend will not be served.');
      app.get('*all', (req, res) => {
        res.status(404).send('Frontend not built. Run npm run build.');
      });
    }
  }

  // 5. Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Unhandled Server Error:', err);
    res.status(500).json({ error: 'A server error occurred', details: err.message });
  });

  // 6. Listen
  if (!httpServer.listening) {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`);
    });
  }

  // 7. Async DB Load
  (async () => {
    try {
      const dbPath = path.join(process.cwd(), 'db.json');
      console.log(`Loading database from ${dbPath}...`);
      db = await JSONFilePreset<Data>(dbPath, defaultData);
      isDbReady = true;
      console.log('Database loaded successfully.');
    } catch (err) {
      console.error('Failed to load database:', err);
      db = { 
        data: JSON.parse(JSON.stringify(defaultData)), 
        write: async () => {},
        read: async () => {}
      };
      isDbReady = true;
      console.log('Using in-memory database fallback.');
    }
  })();

  // Socket.io
  io.on('connection', (socket) => {
    console.log('Client connected');
    socket.on('disconnect', () => console.log('Client disconnected'));
  });
}

// Start the server
startServer().catch(err => {
  console.error('Failed to start server:', err);
});

export default async (req: any, res: any) => {
  await startServer();
  if (typeof app === 'function') {
    return app(req, res);
  }
  res.status(500).send('Server not initialized');
};
