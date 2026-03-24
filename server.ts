import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

declare module 'express-session' {
  interface SessionData {
    user: any;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __anglibotAi: GoogleGenAI | null | undefined;
}

dotenv.config();

const app = express();
app.set('trust proxy', 1);

let ai: GoogleGenAI | null = globalThis.__anglibotAi ?? null;

const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const uploadsDir = isVercel ? '/tmp/uploads' : path.join(process.cwd(), 'public', 'uploads');
const dataDir = isVercel ? '/tmp/data' : path.join(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'app-db.json');
const APP_URL = process.env.APP_URL || `http://localhost:3000`;

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

type DbShape = {
  users: any[];
  dialogues: any[];
  animations: any[];
  suggestions: any[];
  logs: any[];
};

let db: DbShape = {
  users: [],
  dialogues: [],
  animations: [],
  suggestions: [],
  logs: [],
};

const loadDb = () => {
  if (!fs.existsSync(dbFile)) return;
  try {
    const raw = fs.readFileSync(dbFile, 'utf8');
    const parsed = JSON.parse(raw);
    db = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      dialogues: Array.isArray(parsed.dialogues) ? parsed.dialogues : [],
      animations: Array.isArray(parsed.animations) ? parsed.animations : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch (error) {
    console.error('Failed to load local DB:', error);
  }
};

const persistDb = async () => {
  await fs.promises.writeFile(dbFile, JSON.stringify(db, null, 2), 'utf8');
};

const initAI = () => {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    globalThis.__anglibotAi = ai;
  }
};

const getConfigStatus = () => ({
  required: {
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
  },
  optional: {
    APP_URL: !!process.env.APP_URL,
    CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
  },
  storageMode: hasCloudinaryConfig ? 'cloudinary' : 'local',
  databaseMode: 'local-json',
});

const ensureDefaultAdminUser = async () => {
  let user = db.users.find((u) => u.email === 'admin@anglibot.ai');
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
    db.users.push(user);
    await persistDb();
  }
  return user;
};

loadDb();
void ensureDefaultAdminUser();

const upload = multer({ storage: multer.memoryStorage() });

const uploadToCloudinary = async (file: Express.Multer.File) => {
  if (!hasCloudinaryConfig) throw new Error('Cloudinary is not configured');

  const resourceType =
    file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') ? 'video' : 'auto';

  const formData = new FormData();
  formData.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  formData.append('folder', process.env.CLOUDINARY_FOLDER || 'anglibot');
  formData.append('public_id', uuidv4());

  const auth = Buffer.from(`${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`).toString('base64');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}` },
      body: formData,
    }
  );

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'Cloudinary upload failed');
  return data.secure_url || data.url;
};

const saveLocally = async (file: Express.Multer.File) => {
  const ext = path.extname(file.originalname);
  const filename = `${uuidv4()}${ext}`;
  const filepath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(filepath, file.buffer);
  return `${APP_URL}/uploads/${filename}`;
};

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'anglibot-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isVercel,
      sameSite: 'lax',
      httpOnly: true,
    },
  })
);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    dbReady: true,
    dbMode: 'local-json',
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

const asyncRoute = (handler: any) => (req: any, res: any, next: any) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const requireAuth = asyncRoute(async (req: any, res: any, next: any) => {
  initAI();
  if (req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
});

const requireAdmin = asyncRoute(async (req: any, res: any, next: any) => {
  initAI();
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.session.user.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  return next();
});

app.use('/uploads', express.static(uploadsDir));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  initAI();
  const { username, password } = req.body;

  if (username === 'admin' && password === '123admin') {
    const user = await ensureDefaultAdminUser();
    user.lastLogin = new Date().toISOString();

    db.logs.unshift({
      id: uuidv4(),
      userId: user.id,
      userName: user.name,
      timestamp: user.lastLogin,
    });

    req.session.user = user;
    await persistDb();
    return res.json(user);
  }

  return res.status(401).json({ error: 'Username ose fjalëkalim i gabuar' });
}));

app.get('/api/auth/me', asyncRoute(async (req: any, res) => {
  initAI();
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json(req.session.user);
}));

app.get('/api/bootstrap', asyncRoute(async (req: any, res) => {
  initAI();
  const currentUser = req.session.user || null;
  const isAdmin = !!currentUser?.isAdmin;

  res.json({
    currentUser,
    users: isAdmin ? db.users : [],
    dialogues: db.dialogues,
    animations: db.animations,
    suggestions: db.suggestions,
    logs: isAdmin ? db.logs : [],
    config: getConfigStatus(),
  });
}));

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.post('/api/upload', requireAdmin, upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  try {
    const url = hasCloudinaryConfig ? await uploadToCloudinary(req.file) : await saveLocally(req.file);
    res.json({ url, storage: hasCloudinaryConfig ? 'cloudinary' : 'local' });
  } catch (error: any) {
    console.error('Upload Error:', error);
    res.status(503).json({
      error: hasCloudinaryConfig
        ? `Cloudinary upload failed: ${error.message}`
        : `Local upload failed: ${error.message}`,
    });
  }
}));

app.get('/api/users', requireAdmin, asyncRoute(async (req, res) => {
  res.json(db.users);
}));

app.delete('/api/users/:id', requireAdmin, asyncRoute(async (req, res) => {
  db.users = db.users.filter((u) => u.id !== req.params.id);
  await persistDb();
  res.json({ success: true });
}));

app.patch('/api/users/:id', requireAuth, asyncRoute(async (req: any, res) => {
  if (req.body?.isAdmin && !req.session.user?.isAdmin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!req.session.user?.isAdmin && req.session.user?.id !== req.params.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const idx = db.users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  db.users[idx] = { ...db.users[idx], ...req.body };
  if (req.session.user?.id === req.params.id) {
    req.session.user = db.users[idx];
  }

  await persistDb();
  res.json(db.users[idx]);
}));

app.get('/api/dialogues', asyncRoute(async (req, res) => {
  res.json(db.dialogues);
}));

app.post('/api/dialogues', requireAdmin, asyncRoute(async (req, res) => {
  const newDialogue = { ...req.body, id: uuidv4(), createdAt: new Date().toISOString() };
  db.dialogues.unshift(newDialogue);
  await persistDb();
  res.json(newDialogue);
}));

app.delete('/api/dialogues/:id', requireAdmin, asyncRoute(async (req, res) => {
  db.dialogues = db.dialogues.filter((d) => d.id !== req.params.id);
  await persistDb();
  res.json({ success: true });
}));

app.get('/api/animations', asyncRoute(async (req, res) => {
  res.json(db.animations);
}));

app.post('/api/animations', requireAdmin, asyncRoute(async (req, res) => {
  const newAnim = { ...req.body, id: uuidv4(), createdAt: new Date().toISOString() };
  db.animations.unshift(newAnim);
  await persistDb();
  res.json(newAnim);
}));

app.delete('/api/animations/:id', requireAdmin, asyncRoute(async (req, res) => {
  db.animations = db.animations.filter((a) => a.id !== req.params.id);
  await persistDb();
  res.json({ success: true });
}));

app.get('/api/suggestions', asyncRoute(async (req, res) => {
  res.json(db.suggestions);
}));

app.post('/api/suggestions', requireAuth, asyncRoute(async (req, res) => {
  const newSuggestion = { ...req.body, id: uuidv4(), date: new Date().toLocaleDateString() };
  db.suggestions.unshift(newSuggestion);
  await persistDb();
  res.json(newSuggestion);
}));

app.patch('/api/suggestions/:id', requireAuth, asyncRoute(async (req, res) => {
  const idx = db.suggestions.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Suggestion not found' });

  db.suggestions[idx] = { ...db.suggestions[idx], ...req.body };
  await persistDb();
  res.json(db.suggestions[idx]);
}));

app.get('/api/logs', requireAdmin, asyncRoute(async (req, res) => {
  res.json(db.logs);
}));

app.delete('/api/logs', requireAdmin, asyncRoute(async (req, res) => {
  db.logs = [];
  await persistDb();
  res.json({ success: true });
}));

app.get('/api/config/status', (req, res) => {
  res.json({
    ...getConfigStatus(),
    dbReady: true,
    dbMode: 'local-json',
  });
});

app.post('/api/ai/chat', requireAuth, asyncRoute(async (req, res) => {
  const { message, proficiency, history } = req.body;
  if (!ai) return res.status(503).json({ error: 'AI service not initialized' });

  try {
    const chat = ai.chats.create({
      model: 'gemini-3.1-pro-preview',
      config: {
        systemInstruction: `Ti je një mësues ndihmës i gjuhës Angleze për studentët Shqiptarë. Niveli i studentit është: ${proficiency}. Përshtat gjuhën dhe kompleksitetin tënd sipas këtij niveli. Përgjigju në Shqip kur shpjegon rregulla, por inkurajo përdoruesin të flasë Anglisht. Je miqësor, edukativ dhe kreativ në shembujt që jep.`,
      },
      history: history.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      })),
    });
    const result = await chat.sendMessage({ message });
    res.json({ text: result.text });
  } catch (error: any) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ error: error.message });
  }
}));

app.post('/api/ai/generate', requireAuth, asyncRoute(async (req, res) => {
  const { prompt, config, model } = req.body;
  if (!ai) return res.status(503).json({ error: 'AI service not initialized' });

  try {
    const result = await ai.models.generateContent({
      model: model || 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config,
    });
    res.json({ text: result.text });
  } catch (error: any) {
    console.error('AI Generate Error:', error);
    res.status(500).json({ error: error.message });
  }
}));

app.all('/api/*all', (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
});

app.use((err: any, req: any, res: any, next: any) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error', details: err?.message || 'Unknown error' });
});

if (!isVercel) {
  const PORT = 3000;
  import('vite')
    .then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
        root: process.cwd(),
      })
    )
    .then((vite) => {
      app.use(vite.middlewares);
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    });
}

export default app;
