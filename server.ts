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
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, getDoc, setDoc, deleteField } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

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

// Initialize Firebase SDK
const finalFirebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  appId: process.env.FIREBASE_APP_ID || firebaseConfig.appId,
  firestoreDatabaseId: process.env.FIREBASE_FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId
};

const firebaseApp = initializeApp(finalFirebaseConfig);
const db = getFirestore(firebaseApp, finalFirebaseConfig.firestoreDatabaseId);

// Test Firestore connection
async function testFirestore() {
  try {
    const { getDocFromServer } = await import('firebase/firestore');
    await getDocFromServer(doc(db, 'config', 'connection_test'));
    console.log('✅ Firestore connection verified.');
  } catch (error: any) {
    if (error.message?.includes('the client is offline')) {
      console.error('❌ Firestore is offline. Check your Firebase configuration.');
    } else {
      console.log('ℹ️ Firestore connection test completed (may fail if collection doesn\'t exist, which is fine).');
    }
  }
}
testFirestore();

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
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const user = userDoc.data();
        req.session = req.session || {};
        req.session.user = { ...user, id: userDoc.id };
        return next();
      }
    } catch (error) {
      console.error('Error fetching user from Firestore:', error);
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
    try {
      const adminId = 'admin-id';
      const adminDoc = await getDoc(doc(db, 'users', adminId));
      let user;

      if (!adminDoc.exists()) {
        user = {
          id: adminId,
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
        await setDoc(doc(db, 'users', adminId), user);
      } else {
        user = { ...adminDoc.data(), id: adminDoc.id };
        user.lastLogin = new Date().toISOString();
        await updateDoc(doc(db, 'users', adminId), { lastLogin: user.lastLogin });
      }

      await addDoc(collection(db, 'logs'), {
        userId: user.id,
        userName: user.name,
        timestamp: new Date().toISOString()
      });

      req.session.user = user;
      res.json(user);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
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
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const usersList = usersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    res.json(usersList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.delete('/api/users/:id', requireAuth, async (req: any, res) => {
  await initServices();
  if (!req.session.user?.isAdmin) return res.status(403).json({ error: 'Forbidden' });
  try {
    await deleteDoc(doc(db, 'users', req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.patch('/api/users/:id', requireAuth, async (req, res) => {
  await initServices();
  try {
    await updateDoc(doc(db, 'users', req.params.id), req.body);
    const updatedDoc = await getDoc(doc(db, 'users', req.params.id));
    res.json({ ...updatedDoc.data(), id: updatedDoc.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.get('/api/dialogues', async (req, res) => {
  await initServices();
  try {
    const dialoguesSnapshot = await getDocs(collection(db, 'dialogues'));
    const dialoguesList = dialoguesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    res.json(dialoguesList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dialogues' });
  }
});

app.post('/api/dialogues', requireAuth, async (req, res) => {
  await initServices();
  try {
    const { id, ...data } = req.body;
    const newDialogue = { ...data, createdAt: new Date().toISOString() };
    const docRef = await addDoc(collection(db, 'dialogues'), newDialogue);
    res.json({ ...newDialogue, id: docRef.id });
  } catch (error) {
    console.error('Error adding dialogue:', error);
    res.status(500).json({ error: 'Failed to add dialogue' });
  }
});

app.delete('/api/dialogues/:id', requireAuth, async (req, res) => {
  await initServices();
  try {
    await deleteDoc(doc(db, 'dialogues', req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete dialogue' });
  }
});

app.get('/api/animations', async (req, res) => {
  await initServices();
  try {
    const animationsSnapshot = await getDocs(collection(db, 'animations'));
    const animationsList = animationsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    res.json(animationsList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch animations' });
  }
});

app.post('/api/animations', requireAuth, async (req, res) => {
  await initServices();
  try {
    const { id, ...data } = req.body;
    const newAnim = { ...data, createdAt: new Date().toISOString() };
    const docRef = await addDoc(collection(db, 'animations'), newAnim);
    res.json({ ...newAnim, id: docRef.id });
  } catch (error) {
    console.error('Error adding animation:', error);
    res.status(500).json({ error: 'Failed to add animation' });
  }
});

app.delete('/api/animations/:id', requireAuth, async (req, res) => {
  await initServices();
  try {
    await deleteDoc(doc(db, 'animations', req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete animation' });
  }
});

app.get('/api/suggestions', async (req, res) => {
  await initServices();
  try {
    const suggestionsSnapshot = await getDocs(collection(db, 'suggestions'));
    const suggestionsList = suggestionsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    res.json(suggestionsList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

app.post('/api/suggestions', requireAuth, async (req, res) => {
  await initServices();
  try {
    const { id, ...data } = req.body;
    const newSuggestion = { ...data, date: new Date().toLocaleDateString() };
    const docRef = await addDoc(collection(db, 'suggestions'), newSuggestion);
    res.json({ ...newSuggestion, id: docRef.id });
  } catch (error) {
    console.error('Error adding suggestion:', error);
    res.status(500).json({ error: 'Failed to add suggestion' });
  }
});

app.patch('/api/suggestions/:id', requireAuth, async (req, res) => {
  await initServices();
  try {
    await updateDoc(doc(db, 'suggestions', req.params.id), req.body);
    const updatedDoc = await getDoc(doc(db, 'suggestions', req.params.id));
    res.json({ ...updatedDoc.data(), id: updatedDoc.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update suggestion' });
  }
});

app.get('/api/logs', requireAuth, async (req, res) => {
  await initServices();
  try {
    const logsSnapshot = await getDocs(collection(db, 'logs'));
    const logsList = logsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    res.json(logsList);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

app.delete('/api/logs', requireAuth, async (req, res) => {
  await initServices();
  try {
    const logsSnapshot = await getDocs(collection(db, 'logs'));
    const deletePromises = logsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear logs' });
  }
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
