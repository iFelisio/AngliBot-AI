import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { OAuth2Client } from 'google-auth-library';
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
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
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

// Initialize DB
const db = await JSONFilePreset<Data>('db.json', defaultData);

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'anglibot-secret',
      resave: false,
      saveUninitialized: true,
      cookie: { 
        secure: true, 
        sameSite: 'none',
        httpOnly: true 
      },
    })
  );

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

  // Google Auth URL
  app.get('/api/auth/google/url', (req, res) => {
    const redirectUri = `${APP_URL}/api/auth/google/callback`;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?` + 
      new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent'
      }).toString();
    res.json({ url });
  });

  // Google Auth Callback
  app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
      const redirectUri = `${APP_URL}/api/auth/google/callback`;
      const { tokens } = await client.getToken({
        code: code as string,
        redirect_uri: redirectUri,
      });
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      
      if (!payload) throw new Error('No payload');

      const { sub: googleId, email, name, picture } = payload;

      await db.read();
      let user = db.data.users.find(u => u.email === email);

      if (!user) {
        user = {
          id: googleId,
          name,
          email,
          picture,
          isAdmin: db.data.users.length === 0 || email === 'pajtim1.2.bollobani@gmail.com',
          points: 0,
          streak: 0,
          lastLogin: new Date().toISOString(),
          badges: [],
          proficiency: 'Beginner',
          goal: 'Learn English',
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

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Auth error:', error);
      res.status(500).send('Authentication failed');
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
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });

  // Socket.io
  io.on('connection', (socket) => {
    console.log('Client connected');
    socket.on('disconnect', () => console.log('Client disconnected'));
  });
}

startServer();
