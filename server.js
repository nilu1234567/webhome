// ============================================================
// RAKESH.QD.JE - Unified Server
// / → 3D Portfolio (Vite dist)
// /chat → WhatsApp-style Chat App (Socket.IO + SQLite)
// ============================================================

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const session    = require('express-session');
const rateLimit  = require('express-rate-limit');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const Database   = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const app        = express();
const httpServer = http.createServer(app);
const io         = new Server(httpServer, { cors: { origin: '*' } });

const PORT = process.env.PORT || 10000;

// ── Database ────────────────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const db = new Database(path.join(dataDir, 'chat.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    content TEXT NOT NULL,
    timestamp INTEGER DEFAULT (strftime('%s','now'))
  );
`);

// ── File Upload ─────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

// ── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rakesh-chat-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ── Static Files ─────────────────────────────────────────────
// 3D Portfolio at /
app.use('/', express.static(path.join(__dirname, 'dist')));
// Chat static files at /chat
app.use('/chat', express.static(path.join(__dirname, 'chat')));
// Uploaded images
app.use('/uploads', express.static(uploadsDir));

// ── Rate Limiters ────────────────────────────────────────────
const joinLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

function genCode() { return String(Math.floor(1000 + Math.random() * 9000)); }
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Admin API ─────────────────────────────────────────────────
app.post('/admin/login', adminLimiter, (req, res) => {
  if (req.body.password === (process.env.ADMIN_PASSWORD || 'rakesh@45')) {
    req.session.isAdmin = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});
app.post('/admin/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });
app.get('/admin/check', (req, res) => { res.json({ isAdmin: !!(req.session && req.session.isAdmin) }); });
app.get('/admin/rooms', requireAdmin, (req, res) => {
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY created_at DESC').all();
  res.json(rooms.map(r => {
    const msgCount = db.prepare('SELECT COUNT(*) as c FROM messages WHERE room_id=?').get(r.id).c;
    const sockRoom = io.sockets.adapter.rooms.get(r.id);
    return { ...r, messageCount: msgCount, participantCount: sockRoom ? sockRoom.size : 0 };
  }));
});
app.post('/admin/rooms', requireAdmin, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  let code = genCode();
  while (db.prepare('SELECT id FROM rooms WHERE code=?').get(code)) code = genCode();
  db.prepare('INSERT INTO rooms (id, code, name) VALUES (?, ?, ?)').run(id, code, name);
  res.json({ id, code, name });
});
app.delete('/admin/rooms/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM messages WHERE room_id=?').run(req.params.id);
  db.prepare('DELETE FROM rooms WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Chat API ──────────────────────────────────────────────────
app.post('/join', joinLimiter, (req, res) => {
  const code = (req.body.code || '').trim();
  const name = (req.body.name || '').trim();
  if (!code || !name) return res.status(400).json({ error: 'Code and name required' });
  if (name.length > 30) return res.status(400).json({ error: 'Name too long' });
  const room = db.prepare('SELECT * FROM rooms WHERE code=?').get(code);
  if (!room) return res.status(404).json({ error: 'Invalid room code. Please check and try again.' });
  req.session.userName = name;
  req.session.roomId = room.id;
  res.json({ ok: true, roomId: room.id, roomName: room.name });
});
app.get('/messages/:roomId', (req, res) => {
  res.json(db.prepare('SELECT * FROM messages WHERE room_id=? ORDER BY timestamp ASC').all(req.params.roomId));
});
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ── Chat Pages ────────────────────────────────────────────────
app.get('/chat',             (req, res) => res.sendFile(path.join(__dirname, 'chat', 'index.html')));
app.get('/chat/:id',   (req, res) => res.sendFile(path.join(__dirname, 'chat', 'chat.html')));
app.get('/admin',            (req, res) => res.sendFile(path.join(__dirname, 'chat', 'admin-login.html')));
app.get('/admin/dashboard',  (req, res) => res.sendFile(path.join(__dirname, 'chat', 'admin-dashboard.html')));

// ── 3D Site SPA Fallback ──────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

// ── Socket.IO ─────────────────────────────────────────────────
const userMap = {};
io.on('connection', (socket) => {
  socket.on('join_room', ({ roomId, userName }) => {
    if (!db.prepare('SELECT id FROM rooms WHERE id=?').get(roomId)) return;
    socket.join(roomId);
    userMap[socket.id] = { name: userName, roomId };
    socket.to(roomId).emit('user_joined', { name: userName });
    io.to(roomId).emit('participant_count', io.sockets.adapter.rooms.get(roomId)?.size || 0);
  });
  socket.on('send_message', ({ roomId, content, type, sender }) => {
    if (!db.prepare('SELECT id FROM rooms WHERE id=?').get(roomId)) return;
    const id = uuidv4(), ts = Math.floor(Date.now() / 1000);
    db.prepare('INSERT INTO messages (id, room_id, sender_name, type, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(id, roomId, sender, type || 'text', content, ts);
    io.to(roomId).emit('receive_message', { id, room_id: roomId, sender_name: sender, type: type || 'text', content, timestamp: ts });
  });
  socket.on('typing',      ({ roomId, userName }) => socket.to(roomId).emit('user_typing', { name: userName }));
  socket.on('stop_typing', ({ roomId })           => socket.to(roomId).emit('user_stop_typing'));
  socket.on('disconnect', () => {
    const user = userMap[socket.id];
    if (user) {
      delete userMap[socket.id];
      socket.to(user.roomId).emit('user_left', { name: user.name });
      io.to(user.roomId).emit('participant_count', io.sockets.adapter.rooms.get(user.roomId)?.size || 0);
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   🌐 3D Site: http://localhost:${PORT}/`);
  console.log(`   💬 Chat:    http://localhost:${PORT}/chat`);
  console.log(`   🔑 Admin:   http://localhost:${PORT}/admin`);
});