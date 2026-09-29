import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = 'rakesh@45';

// ─── In-Memory Chat Storage ───────────────────────────────────────────────────
const activeRooms = new Map();
const roomMessages = new Map();
const roomUsers = new Map();

const defaultRoom = {
    id: 'room_default',
    name: 'Rakesh Special Friends Lounge',
    code: '748291',
    description: 'bate kre dill se unlimate free and privatly',
    createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
};
activeRooms.set(defaultRoom.code, defaultRoom);
roomMessages.set(defaultRoom.code, [{
    id: 'msg_welcome',
    senderId: 'admin_rakesh',
    senderName: 'Rakesh (Admin)',
    avatar: '👑',
    text: 'Swagat hai Rakesh Chat Room me! "bate kre dill se unlimate free and privatly". Shared Secret PIN: 748291',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isAdmin: true
}]);
roomUsers.set(defaultRoom.code, new Map());

// ─── Static Files ─────────────────────────────────────────────────────────────
// 3D Portfolio (root)
app.use('/', express.static(path.join(__dirname, 'dist')));

// Chat static files at /chat
app.use('/chat', express.static(path.join(__dirname, 'chat')));

app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
// Chat page
app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat', 'index.html'));
});

// Chat API
app.get('/api/rooms', (req, res) => {
    res.json(Array.from(activeRooms.values()));
});

// SPA fallback for 3D site
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[Socket Connected] ID: ${socket.id}`);
    socket.emit('rooms-list-updated', Array.from(activeRooms.values()));

    socket.on('join-room', ({ name, pin, avatar, isAdmin }) => {
        const cleanPin = String(pin).trim();
        const targetRoom = activeRooms.get(cleanPin);
        if (!targetRoom) {
            return socket.emit('error-toast', 'Galat Chat Room PIN! Sahi PIN Rakesh Admin se prapt karein.');
        }
        if (socket.currentRoom) leaveCurrentRoomSocket(socket);

        socket.join(cleanPin);
        socket.currentRoom = cleanPin;
        socket.userData = { id: socket.id, name, avatar, isAdmin };

        if (!roomUsers.has(cleanPin)) roomUsers.set(cleanPin, new Map());
        roomUsers.get(cleanPin).set(socket.id, socket.userData);

        const history = roomMessages.get(cleanPin) || [];
        socket.emit('room-history', { room: targetRoom, messages: history });

        saveAndBroadcast(cleanPin, {
            id: 'sys_' + Date.now(), isSystem: true,
            text: `${name} room me shamil ho gaye.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        broadcastMembers(cleanPin);
    });

    socket.on('send-message', ({ roomCode, text, image, senderName, avatar, isAdmin }) => {
        const cleanPin = String(roomCode).trim();
        if (!activeRooms.has(cleanPin)) return;
        saveAndBroadcast(cleanPin, {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            senderId: socket.id,
            senderName: senderName || 'Anonymous',
            avatar: avatar || '👤',
            text: text || '',
            image: image || null,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isAdmin: !!isAdmin
        });
    });

    socket.on('typing', ({ roomCode, userName, isTyping }) => {
        socket.to(String(roomCode).trim()).emit('user-typing', { userName, isTyping });
    });

    socket.on('admin-create-room', ({ name, code, description, password }) => {
        if (password !== ADMIN_PASSWORD) return socket.emit('error-toast', 'Unauthorized!');
        const cleanCode = String(code).trim();
        if (activeRooms.has(cleanCode)) return socket.emit('error-toast', 'Is PIN se already room bana hua hai!');
        const newRoom = {
            id: 'room_' + Date.now(), name: name.trim(), code: cleanCode,
            description: (description || 'bate kre dill se').trim(),
            createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        activeRooms.set(cleanCode, newRoom);
        roomMessages.set(cleanCode, []);
        roomUsers.set(cleanCode, new Map());
        io.emit('rooms-list-updated', Array.from(activeRooms.values()));
        socket.emit('action-success', `Chatroom "${newRoom.name}" ban gaya! Secret PIN: ${cleanCode}`);
    });

    socket.on('admin-delete-room', ({ roomCode, password }) => {
        if (password !== ADMIN_PASSWORD) return socket.emit('error-toast', 'Unauthorized!');
        const cleanCode = String(roomCode).trim();
        const targetRoom = activeRooms.get(cleanCode);
        if (!targetRoom) return;
        io.to(cleanCode).emit('room-deleted-kick', { roomCode: cleanCode, roomTitle: targetRoom.name });
        activeRooms.delete(cleanCode); roomMessages.delete(cleanCode); roomUsers.delete(cleanCode);
        io.emit('rooms-list-updated', Array.from(activeRooms.values()));
        socket.emit('action-success', `Chatroom "${targetRoom.name}" delete ho gaya!`);
    });

    socket.on('disconnect', () => {
        if (socket.currentRoom) leaveCurrentRoomSocket(socket);
        console.log(`[Socket Disconnected] ID: ${socket.id}`);
    });
});

function leaveCurrentRoomSocket(socket) {
    const roomCode = socket.currentRoom;
    if (!roomCode) return;
    roomUsers.get(roomCode)?.delete(socket.id);
    if (socket.userData) {
        saveAndBroadcast(roomCode, {
            id: 'sys_' + Date.now(), isSystem: true,
            text: `${socket.userData.name} room se bahar chale gaye.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    }
    broadcastMembers(roomCode);
    socket.leave(roomCode);
    socket.currentRoom = null;
}

function saveAndBroadcast(roomCode, msgObj) {
    if (!roomMessages.has(roomCode)) roomMessages.set(roomCode, []);
    roomMessages.get(roomCode).push(msgObj);
    io.to(roomCode).emit('receive-message', msgObj);
}

function broadcastMembers(roomCode) {
    const usersMap = roomUsers.get(roomCode);
    io.to(roomCode).emit('room-members-update', usersMap ? Array.from(usersMap.values()) : []);
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Rakesh Server running on port ${PORT}`);
    console.log(`   🌐 3D Site: http://localhost:${PORT}/`);
    console.log(`   💬 Chat:    http://localhost:${PORT}/chat`);
});
