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
import mongoose from 'mongoose';
import { GoogleGenAI } from '@google/genai';

declare module 'express-session' {
  interface SessionData {
    user: any;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __anglibotMongoPromise: Promise<typeof mongoose> | null | undefined;
  // eslint-disable-next-line no-var
  var __anglibotAi: GoogleGenAI | null | undefined;
}

dotenv.config();

const app = express();
app.set('trust proxy', 1);

let ai: GoogleGenAI | null = globalThis.__anglibotAi ?? null;
let isDbReady = false;
let initPromise: Promise<void> | null = null;

const ensureDefaultAdminUser = async () => {
  let user = await User.findOne({ email: 'admin@anglibot.ai' }).lean();
  if (!user) {
    user = await User.create({
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
    });
  }

  return user;
};

// Vercel specific paths
const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const uploadsDir = isVercel ? '/tmp/uploads' : path.join(process.cwd(), 'public', 'uploads');
const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create uploads directory:', err);
  }
}

// Mongoose Models
mongoose.set('bufferCommands', false);
const User = mongoose.models.User || mongoose.model<any>('User', new mongoose.Schema({ id: String, email: String }, { strict: false }));
const Dialogue = mongoose.models.Dialogue || mongoose.model<any>('Dialogue', new mongoose.Schema({ id: String }, { strict: false }));
const Animation = mongoose.models.Animation || mongoose.model<any>('Animation', new mongoose.Schema({ id: String }, { strict: false }));
const Suggestion = mongoose.models.Suggestion || mongoose.model<any>('Suggestion', new mongoose.Schema({ id: String }, { strict: false }));
const LoginLog = mongoose.models.LoginLog || mongoose.model<any>('LoginLog', new mongoose.Schema({ id: String }, { strict: false }));

// Initialize AI and DB lazily
async function initServices() {
  if (!initPromise) {
    initPromise = (async () => {
      if (!ai) {
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' });
        globalThis.__anglibotAi = ai;
      }

      if (mongoose.connection.readyState === 1) {
        isDbReady = true;
        return;
      }

      if (!process.env.MONGODB_URI) {
        console.warn('MONGODB_URI is not set. Database will not work.');
        isDbReady = false;
        return;
      }

      try {
        if (!globalThis.__anglibotMongoPromise) {
          globalThis.__anglibotMongoPromise = mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
          });
        }

        await globalThis.__anglibotMongoPromise;
        isDbReady = true;
        console.log('MongoDB connected successfully');
      } catch (err) {
        globalThis.__anglibotMongoPromise = null;
        isDbReady = false;
        console.error('MongoDB connection error:', err);
        throw err;
      }
    })().finally(() => {
      initPromise = null;
    });
  }

  await initPromise;
}

// Multer setup
const upload = multer({ storage: multer.memoryStorage() });
const APP_URL = process.env.APP_URL || `http://localhost:3000`;

const uploadToCloudinary = async (file: Express.Multer.File) => {
  if (!hasCloudinaryConfig) {
    throw new Error('Cloudinary is not configured');
  }

  const resourceType =
    file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')
      ? 'video'
      : 'auto';

  const formData = new FormData();
  formData.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  formData.append('folder', process.env.CLOUDINARY_FOLDER || 'anglibot');
  formData.append('public_id', uuidv4());

  const auth = Buffer.from(
    `${process.env.CLOUDINARY_API_KEY}:${process.env.CLOUDINARY_API_SECRET}`
  ).toString('base64');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
      },
      body: formData,
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Cloudinary upload failed');
  }

  return data.secure_url || data.url;
};

const saveLocally = async (file: Express.Multer.File) => {
  const ext = path.extname(file.originalname);
  const filename = `${uuidv4()}${ext}`;
  const filepath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(filepath, file.buffer);
  return `${APP_URL}/uploads/${filename}`;
};

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
    dbReady: isDbReady, 
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString()
  });
});

// API Routes
const asyncRoute = (handler: any) => (req: any, res: any, next: any) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const requireAuth = asyncRoute(async (req: any, res: any, next: any) => {
  await initServices();
  if (req.session.user) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
});

app.use('/uploads', express.static(uploadsDir));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const { username, password } = req.body;

  if (username === 'admin' && password === '123admin') {
    let user = await ensureDefaultAdminUser();

    await User.updateOne({ email: 'admin@anglibot.ai' }, { lastLogin: new Date().toISOString() });
    user.lastLogin = new Date().toISOString();

    await LoginLog.create({
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
}));

app.get('/api/auth/me', asyncRoute(async (req: any, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  if (!req.session.user) {
    req.session.user = await ensureDefaultAdminUser();
  }
  res.json(req.session.user);
}));

app.get('/api/bootstrap', asyncRoute(async (req: any, res) => {
  await initServices();

  const config = {
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    APP_URL: !!process.env.APP_URL,
    MONGODB_URI: !!process.env.MONGODB_URI,
    CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
  };

  if (!isDbReady) {
    return res.status(503).json({
      error: 'Database not connected',
      config,
    });
  }

  if (!req.session.user) {
    req.session.user = await ensureDefaultAdminUser();
  }

  const currentUser = req.session.user;
  const isAdmin = !!currentUser?.isAdmin;

  const [users, dialogues, animations, suggestions, logs] = await Promise.all([
    isAdmin ? User.find({}).lean() : Promise.resolve([]),
    Dialogue.find({}).lean(),
    Animation.find({}).lean(),
    Suggestion.find({}).lean(),
    isAdmin ? LoginLog.find({}).lean() : Promise.resolve([]),
  ]);

  res.json({
    currentUser,
    users,
    dialogues,
    animations,
    suggestions,
    logs,
    config,
  });
}));

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  (async () => {
    try {
      const url = hasCloudinaryConfig ? await uploadToCloudinary(req.file!) : await saveLocally(req.file!);
      res.json({
        url,
        storage: hasCloudinaryConfig ? 'cloudinary' : 'local',
      });
    } catch (error: any) {
      console.error('Upload Error:', error);
      res.status(503).json({
        error: hasCloudinaryConfig
          ? `Cloudinary upload failed: ${error.message}`
          : `Local upload failed: ${error.message}`,
      });
    }
  })();
});

app.get('/api/users', requireAuth, asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const users = await User.find({}).lean();
  res.json(users);
}));

app.delete('/api/users/:id', requireAuth, asyncRoute(async (req: any, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  await User.deleteOne({ id: req.params.id });
  res.json({ success: true });
}));

app.patch('/api/users/:id', requireAuth, asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const updated = await User.findOneAndUpdate({ id: req.params.id }, req.body, { new: true }).lean();
  if (updated) {
    res.json(updated);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
}));

app.get('/api/dialogues', asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const dialogues = await Dialogue.find({}).lean();
  res.json(dialogues);
}));

app.post('/api/dialogues', requireAuth, asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const newDialogue = await Dialogue.create({ ...req.body, id: uuidv4(), createdAt: new Date().toISOString() });
  res.json(newDialogue);
}));

app.delete('/api/dialogues/:id', requireAuth, asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  await Dialogue.deleteOne({ id: req.params.id });
  res.json({ success: true });
}));

app.get('/api/animations', asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const animations = await Animation.find({}).lean();
  res.json(animations);
}));

app.post('/api/animations', requireAuth, asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const newAnim = await Animation.create({ ...req.body, id: uuidv4(), createdAt: new Date().toISOString() });
  res.json(newAnim);
}));

app.delete('/api/animations/:id', requireAuth, asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  await Animation.deleteOne({ id: req.params.id });
  res.json({ success: true });
}));

app.get('/api/suggestions', asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const suggestions = await Suggestion.find({}).lean();
  res.json(suggestions);
}));

app.post('/api/suggestions', requireAuth, asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const newSuggestion = await Suggestion.create({ ...req.body, id: uuidv4(), date: new Date().toLocaleDateString() });
  res.json(newSuggestion);
}));

app.patch('/api/suggestions/:id', requireAuth, asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const updated = await Suggestion.findOneAndUpdate({ id: req.params.id }, req.body, { new: true }).lean();
  if (updated) {
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Suggestion not found' });
  }
}));

app.get('/api/logs', requireAuth, asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  const logs = await LoginLog.find({}).lean();
  res.json(logs);
}));

app.delete('/api/logs', requireAuth, asyncRoute(async (req, res) => {
  await initServices();
  if (!isDbReady) return res.status(503).json({ error: 'Database not connected' });
  await LoginLog.deleteMany({});
  res.json({ success: true });
}));

app.get('/api/config/status', (req, res) => {
  res.json({
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    APP_URL: !!process.env.APP_URL,
    MONGODB_URI: !!process.env.MONGODB_URI,
    CLOUDINARY_CLOUD_NAME: !!process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: !!process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: !!process.env.CLOUDINARY_API_SECRET,
  });
});

app.post('/api/ai/chat', requireAuth, asyncRoute(async (req, res) => {
  const { message, proficiency, history } = req.body;
  if (!ai) {
    return res.status(503).json({ error: 'AI service not initialized' });
  }

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
}));

app.post('/api/ai/generate', requireAuth, asyncRoute(async (req, res) => {
  const { prompt, config, model } = req.body;
  if (!ai) {
    return res.status(503).json({ error: 'AI service not initialized' });
  }

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
}));

app.all('/api/*all', (req, res) => {
  res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
});

// Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Server Error:', err);
  const details = err?.message || 'Unknown error';
  const isMongoError =
    err?.name?.includes('Mongo') ||
    details.includes('ECONNREFUSED') ||
    details.includes('ECONNRESET') ||
    details.includes('buffering timed out') ||
    details.includes('Server selection timed out') ||
    details.includes('topology');

  if (isMongoError) {
    return res.status(503).json({
      error: 'Database temporarily unavailable',
      details,
    });
  }

  res.status(500).json({ error: 'Internal Server Error', details });
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
