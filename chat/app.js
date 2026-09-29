/* ==========================================================================
   RAKESH CHAT ROOM - REALTIME SOCKET.IO FRONTEND CLIENT LOGIC (STRICT PIN CHECK)
   ========================================================================== */

const ADMIN_PASSWORD_CORRECT = 'rakesh@45';
const AVATARS = ['😎', '🤖', '🦊', '🦁', '🚀', '👑', '⚡', '🐉'];

let socket = null;
try {
    socket = io();
} catch (e) {
    console.error('Socket.io library not loaded:', e);
}

const appState = {
    isAdminAuthenticated: false,
    currentView: 'user', // 'user', 'admin', 'chat'
    selectedAvatar: '😎',
    currentUser: {
        id: '',
        name: '',
        avatar: '',
        isAdmin: false
    },
    activeRoom: null,
    serverRooms: [],
    onlineMembers: [],
    soundEnabled: true,
    typingTimeout: null
};

// 1. INITIALIZATION & SOCKET EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    initAvatarPicker();
    checkAdminSession();
    setupSocketListeners();
    generateRandomCode();
});

function setupSocketListeners() {
    if (!socket) return;

    socket.on('connect', () => {
        console.log('Connected to WebSocket Server:', socket.id);
        const syncBadge = document.getElementById('sync-status');
        if (syncBadge) {
            syncBadge.innerHTML = '<span class="pulse-dot"></span> Live Server';
            syncBadge.style.color = '#10B981';
        }
    });

    socket.on('disconnect', () => {
        const syncBadge = document.getElementById('sync-status');
        if (syncBadge) {
            syncBadge.innerHTML = '<span class="pulse-dot" style="background:#EF4444;"></span> Offline';
            syncBadge.style.color = '#EF4444';
        }
    });

    socket.on('rooms-list-updated', (rooms) => {
        appState.serverRooms = rooms || [];
        if (appState.currentView === 'admin' && appState.isAdminAuthenticated) {
            renderAdminRoomsList();
            updateAdminStats();
        }
    });

    socket.on('room-history', ({ room, messages }) => {
        appState.activeRoom = room;
        renderChatMessages(messages);
        switchMainView('chat');
    });

    socket.on('receive-message', (msg) => {
        if (!appState.activeRoom) return;

        appendSingleMessageUI(msg);
        scrollToBottom();

        if (msg.senderId !== socket.id && !msg.isSystem) {
            playSynthSound('receive');
        }
    });

    socket.on('room-members-update', (members) => {
        appState.onlineMembers = members || [];
        const countBadge = document.getElementById('members-count');
        if (countBadge) countBadge.innerText = appState.onlineMembers.length;
        renderParticipantsModalList();
    });

    socket.on('user-typing', ({ userName, isTyping }) => {
        const indicator = document.getElementById('typing-indicator');
        const textEl = document.getElementById('typing-text');
        if (indicator && textEl) {
            if (isTyping) {
                textEl.innerText = `${userName} type kar rahe hain...`;
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        }
    });

    socket.on('room-deleted-kick', ({ roomCode, roomTitle }) => {
        if (appState.activeRoom && String(appState.activeRoom.code).trim() === String(roomCode).trim()) {
            appState.activeRoom = null;
            switchMainView('user');
            showToast(`Alert: Chatroom "${roomTitle}" Rakesh Admin dwara delete kar diya gaya!`, 'error');
            playSynthSound('alert');
        }
    });

    socket.on('action-success', (msg) => {
        showToast(msg, 'success');
        playSynthSound('join');
    });

    socket.on('error-toast', (msg) => {
        showToast(msg, 'error');
        playSynthSound('alert');
    });
}

function initAvatarPicker() {
    const picker = document.getElementById('avatar-picker');
    if (!picker) return;
    picker.innerHTML = '';
    AVATARS.forEach((emoji, index) => {
        const opt = document.createElement('div');
        opt.className = `avatar-opt ${index === 0 ? 'selected' : ''}`;
        opt.innerText = emoji;
        opt.onclick = () => {
            document.querySelectorAll('.avatar-opt').forEach(el => el.classList.remove('selected'));
            opt.classList.add('selected');
            appState.selectedAvatar = emoji;
        };
        picker.appendChild(opt);
    });
}

function togglePinVisibility(btn) {
    const input = document.getElementById('pin-input');
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
    }
}

// 2. UNIFIED ENTRANCE HANDLER (STRICT PIN CHECKING)
function handleUnifiedSubmit(event) {
    event.preventDefault();
    const nameInput = document.getElementById('user-name');
    const pinInput = document.getElementById('pin-input');

    const name = nameInput ? nameInput.value.trim() : '';
    const pinOrPwd = pinInput ? pinInput.value.trim() : '';

    if (!pinOrPwd) {
        showToast('Kripya Room PIN dalein!', 'error');
        return;
    }

    // MAGIC ADMIN PASSWORD CHECK
    if (pinOrPwd === ADMIN_PASSWORD_CORRECT) {
        appState.isAdminAuthenticated = true;
        sessionStorage.setItem('rakesh_admin_session', 'true');
        showToast('Swagat hai Rakesh Admin! Real-Time Control Center me login successful.', 'success');
        playSynthSound('join');
        switchMainView('admin');
        renderAdminRoomsList();
        updateAdminStats();
        return;
    }

    // FRIEND JOIN VIA REALTIME SOCKET
    if (!name) {
        showToast('Kripya apna Display Name daalein!', 'error');
        return;
    }

    const cleanPin = String(pinOrPwd).trim();

    // STRICT PIN CHECK: Only allow joining if room was created by Admin Rakesh!
    const roomExists = appState.serverRooms.some(r => String(r.code).trim() === cleanPin);
    if (!roomExists) {
        showToast('Galat Chat Room PIN! Sahi PIN Rakesh Admin se prapt karein.', 'error');
        playSynthSound('alert');
        return;
    }

    appState.currentUser = {
        id: socket ? socket.id : 'usr_' + Date.now(),
        name: name,
        avatar: appState.selectedAvatar,
        isAdmin: false
    };

    if (socket) {
        socket.emit('join-room', {
            name: name,
            pin: cleanPin,
            avatar: appState.selectedAvatar,
            isAdmin: false
        });
    }

    playSynthSound('join');
}

// Switch View
function switchMainView(viewName) {
    appState.currentView = viewName;
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

    if (viewName === 'user') {
        document.getElementById('user-view').classList.add('active');
    } else if (viewName === 'admin') {
        document.getElementById('admin-view').classList.add('active');
    } else if (viewName === 'chat') {
        document.getElementById('chat-view').classList.add('active');
        if (appState.activeRoom) {
            document.getElementById('chat-room-name').innerText = appState.activeRoom.name;
            document.getElementById('chat-room-code').innerText = appState.activeRoom.code;
            const adminBadge = document.getElementById('admin-room-badge');
            if (adminBadge) adminBadge.classList.toggle('hidden', !appState.currentUser.isAdmin);
        }
    }
}

// 3. ADMIN DASHBOARD & REALTIME ROOM CREATION / DELETION
function checkAdminSession() {
    const isAuth = sessionStorage.getItem('rakesh_admin_session') === 'true';
    if (isAuth) {
        appState.isAdminAuthenticated = true;
    }
}

function handleAdminLogout() {
    appState.isAdminAuthenticated = false;
    sessionStorage.removeItem('rakesh_admin_session');
    const pinInput = document.getElementById('pin-input');
    if (pinInput) pinInput.value = '';
    switchMainView('user');
    showToast('Rakesh Admin Logout ho gaye.', 'info');
}

function generateRandomCode() {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeInput = document.getElementById('custom-room-code');
    if (codeInput) codeInput.value = code;
}

function handleCreateRoom(event) {
    event.preventDefault();
    if (!appState.isAdminAuthenticated) {
        showToast('Sirf Rakesh Admin room bana sakte hain!', 'error');
        return;
    }

    const titleInput = document.getElementById('new-room-name');
    const codeInput = document.getElementById('custom-room-code');
    const descInput = document.getElementById('new-room-desc');

    const title = titleInput.value.trim();
    let code = codeInput.value.trim();
    const desc = descInput ? descInput.value.trim() : '';

    if (!code) {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    }

    if (socket) {
        socket.emit('admin-create-room', {
            name: title,
            code: code,
            description: desc,
            password: ADMIN_PASSWORD_CORRECT
        });
    }

    titleInput.value = '';
    if (descInput) descInput.value = '';
    generateRandomCode();
}

function deleteRoomByAdmin(roomCode, roomTitle) {
    const cleanCode = String(roomCode).trim();
    if (!confirm(`Kya aap "${roomTitle}" (PIN: ${cleanCode}) chatroom delete karna chahte hain? Sabhi connected devices se room turant delete ho jayega.`)) {
        return;
    }

    if (socket) {
        socket.emit('admin-delete-room', {
            roomCode: cleanCode,
            password: ADMIN_PASSWORD_CORRECT
        });
    }
}

function joinRoomAsAdmin(roomCode) {
    const cleanCode = String(roomCode).trim();

    appState.currentUser = {
        id: socket ? socket.id : 'admin_rakesh_' + Date.now(),
        name: 'Rakesh (Admin)',
        avatar: '👑',
        isAdmin: true
    };

    if (socket) {
        socket.emit('join-room', {
            name: 'Rakesh (Admin)',
            pin: cleanCode,
            avatar: '👑',
            isAdmin: true
        });
    }
}

function requestRoomsUpdate() {
    fetch('/api/rooms')
        .then(res => res.json())
        .then(rooms => {
            appState.serverRooms = rooms || [];
            renderAdminRoomsList();
            updateAdminStats();
            showToast('Rooms list refreshed', 'info');
        })
        .catch(() => {});
}

function renderAdminRoomsList() {
    const container = document.getElementById('admin-rooms-container');
    const roomsCountEl = document.getElementById('rooms-count');
    if (!container) return;

    const rooms = appState.serverRooms;
    if (roomsCountEl) roomsCountEl.innerText = rooms.length;

    if (rooms.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">
                <i class="fa-solid fa-comments" style="font-size: 2.5rem; margin-bottom: 0.8rem; display: block; color: var(--color-warning);"></i>
                <p>Abhi server par koi active room nahi hai. Form se naya room banayein.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = rooms.map(room => {
        return `
            <div class="room-card glass-card">
                <div class="room-card-header">
                    <div>
                        <div class="room-card-title">${escapeHTML(room.name)}</div>
                        <div class="room-card-desc">${escapeHTML(room.description)}</div>
                    </div>
                    <div class="secret-code-pill" title="Click to Copy PIN" onclick="copyToClipboard('${room.code}')">
                        <i class="fa-solid fa-key"></i> PIN: ${room.code}
                    </div>
                </div>
                <div class="room-card-footer">
                    <span class="member-pill"><i class="fa-solid fa-circle-nodes"></i> Active Room</span>
                    <div style="display: flex; gap: 0.4rem;">
                        <button class="primary-btn btn-sm" onclick="joinRoomAsAdmin('${room.code}')">
                            <i class="fa-solid fa-crown"></i> Join as Admin
                        </button>
                        <button class="danger-btn btn-sm" title="Delete Room" onclick="deleteRoomByAdmin('${room.code}', '${escapeHTML(room.name)}')">
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateAdminStats() {
    const rooms = appState.serverRooms;
    const totalRoomsEl = document.getElementById('stat-total-rooms');
    if (totalRoomsEl) totalRoomsEl.innerText = rooms.length;
}

// 4. REAL-TIME MESSAGING & MEDIA ATTACHMENT
let pendingImageBase64 = null;

function handleSendMessage(event) {
    event.preventDefault();
    if (!appState.activeRoom || !socket) return;

    const input = document.getElementById('message-text-input');
    const text = input ? input.value.trim() : '';

    if (!text && !pendingImageBase64) return;

    socket.emit('send-message', {
        roomCode: appState.activeRoom.code,
        text: text,
        image: pendingImageBase64,
        senderName: appState.currentUser.name,
        avatar: appState.currentUser.avatar,
        isAdmin: appState.currentUser.isAdmin
    });

    if (input) input.value = '';
    cancelImageUpload();
    playSynthSound('send');
}

function renderChatMessages(messages) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = '';
    (messages || []).forEach(msg => {
        appendSingleMessageUI(msg);
    });

    scrollToBottom();
}

function appendSingleMessageUI(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const isMine = socket && msg.senderId === socket.id;
    const isSystem = msg.isSystem;

    const msgEl = document.createElement('div');

    if (isSystem) {
        msgEl.className = 'msg-wrapper system-msg';
        msgEl.innerHTML = `<div class="system-bubble ${msg.isAlert ? 'system-alert' : ''}">${escapeHTML(msg.text)}</div>`;
    } else {
        msgEl.className = `msg-wrapper ${isMine ? 'my-msg' : 'other-msg'} ${msg.isAdmin ? 'admin-msg' : ''}`;
        msgEl.innerHTML = `
            <div class="msg-header">
                <span class="sender-name">${msg.avatar || '👤'} ${escapeHTML(msg.senderName)} ${msg.isAdmin ? '<span class="admin-tag">RAKESH ADMIN</span>' : ''}</span>
                <span class="msg-time">${msg.timestamp}</span>
            </div>
            <div class="msg-bubble">
                ${msg.text ? escapeHTML(msg.text) : ''}
                ${msg.image ? `<br><img src="${msg.image}" class="msg-image" alt="Attachment">` : ''}
            </div>
        `;
    }

    container.appendChild(msgEl);
}

function confirmLeaveRoom() {
    if (confirm('Kya aap chat room chhodna chahte hain?')) {
        if (appState.activeRoom) {
            appState.activeRoom = null;
        }
        switchMainView(appState.isAdminAuthenticated ? 'admin' : 'user');
    }
}

function scrollToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

function handleImageSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showToast('Photo size 2MB se kam honi chahiye!', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        pendingImageBase64 = e.target.result;
        document.getElementById('preview-img-src').src = pendingImageBase64;
        document.getElementById('image-preview-container').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function cancelImageUpload() {
    pendingImageBase64 = null;
    const previewContainer = document.getElementById('image-preview-container');
    if (previewContainer) previewContainer.classList.add('hidden');
    const fileInput = document.getElementById('image-file-input');
    if (fileInput) fileInput.value = '';
}

function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    if (picker) picker.classList.toggle('hidden');
}

function insertEmoji(emoji) {
    const input = document.getElementById('message-text-input');
    if (input) {
        input.value += emoji;
        input.focus();
    }
    toggleEmojiPicker();
}

function handleTypingEvent() {
    if (!appState.activeRoom || !socket) return;

    if (!appState.typingTimeout) {
        socket.emit('typing', {
            roomCode: appState.activeRoom.code,
            userName: appState.currentUser.name,
            isTyping: true
        });
    }

    clearTimeout(appState.typingTimeout);
    appState.typingTimeout = setTimeout(() => {
        socket.emit('typing', {
            roomCode: appState.activeRoom.code,
            userName: appState.currentUser.name,
            isTyping: false
        });
        appState.typingTimeout = null;
    }, 2000);
}

// 5. MODALS & UTILITIES
function renderParticipantsModalList() {
    const list = document.getElementById('participants-list');
    if (!list) return;

    list.innerHTML = appState.onlineMembers.map(m => `
        <li class="participant-item">
            <div class="participant-avatar">${m.avatar || '👤'}</div>
            <div class="participant-name">${escapeHTML(m.name)} ${m.id === (socket ? socket.id : '') ? '(You)' : ''} ${m.isAdmin ? '<span class="admin-tag">RAKESH ADMIN</span>' : ''}</div>
        </li>
    `).join('');
}

function asyncPasteCode() {
    navigator.clipboard.readText().then(text => {
        if (text) {
            const input = document.getElementById('pin-input');
            if (input) input.value = text.trim();
            showToast('PIN paste ho gaya!', 'info');
        }
    }).catch(() => {});
}

function pastePinCode() {
    asyncPasteCode();
}

function copyCurrentRoomCode() {
    if (appState.activeRoom) {
        copyToClipboard(appState.activeRoom.code);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Room PIN ${text} copy ho gaya!`, 'success');
        playSynthSound('receive');
    }).catch(() => {
        showToast(`Room PIN: ${text}`, 'info');
    });
}

function toggleSound() {
    appState.soundEnabled = !appState.soundEnabled;
    const btn = document.getElementById('sound-toggle-btn');
    if (btn) {
        btn.innerHTML = appState.soundEnabled ?
            '<i class="fa-solid fa-volume-high"></i>' :
            '<i class="fa-solid fa-volume-xmark"></i>';
    }
    showToast(appState.soundEnabled ? 'Audio effects ON' : 'Audio OFF', 'info');
}

function playSynthSound(type) {
    if (!appState.soundEnabled) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        if (type === 'send') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 'receive') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'join') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(329.63, now);
            osc.frequency.setValueAtTime(440, now + 0.1);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'alert') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(150, now + 0.2);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    } catch (e) {}
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-circle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function toggleParticipantsModal() {
    const modal = document.getElementById('participants-modal');
    if (!modal) return;
    modal.classList.toggle('hidden');

    if (!modal.classList.contains('hidden')) {
        renderParticipantsModalList();
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
}

function closeModalOnOverlay(event, modalId) {
    if (event.target.id === modalId) {
        closeModal(modalId);
    }
}
