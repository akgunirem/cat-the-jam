const queryToken = new URLSearchParams(window.location.search).get('token');
if (queryToken) {
	try {
		localStorage.setItem('cat_jam_jwt', queryToken);
	} catch (e) {
		// Keep in-memory token if storage is disabled.
	}
	const cleanUrl = new URL(window.location.href);
	cleanUrl.searchParams.delete('token');
	window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search);
}

const token = queryToken || localStorage.getItem('cat_jam_jwt');
const authStatusEl = document.getElementById('authStatus');
const userInfoEl = document.getElementById('userInfo');
const coalitionInfoEl = document.getElementById('coalitionInfo');
const scoreInfoEl = document.getElementById('scoreInfo');
const chatStatusEl = document.getElementById('chatStatus');
const chatLogEl = document.getElementById('chatLog');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const logoutBtn = document.getElementById('logoutBtn');
const chatSendBtn = chatForm?.querySelector('button[type="submit"]');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const state = {
	me: null,
	players: {},
	coin: { x: 400, y: 300 },
	myCoalitionId: null,
	authenticated: false,
	keys: new Set()
};

const COALITION_COLORS = {
	'Gryffindor': '#ef4444', // red
	'Slytherin': '#10b981', // green
	'Hufflepuff': '#f59e0b', // yellow
	'Ravenclaw': '#60a5fa' // blue
};

function setChatEnabled(enabled) {
	if (chatInput) {
		chatInput.disabled = !enabled;
	}
	if (chatSendBtn) {
		chatSendBtn.disabled = !enabled;
	}
	if (chatStatusEl) {
		chatStatusEl.textContent = enabled ? 'Chat ready' : 'Waiting for authentication...';
	}
}

setChatEnabled(false);

if (!token) {
	authStatusEl.textContent = 'No login token found. Please login from /';
	authStatusEl.style.color = '#ef4444';
	if (chatStatusEl) {
		chatStatusEl.textContent = 'Login required';
	}
}

const socket = io('http://localhost:5000', {
	transports: ['polling']
});

socket.on('connect', () => {
	state.me = socket.id;
	authStatusEl.textContent = token ? 'Connected. Authenticating...' : 'Connected.';
	if (!token) {
		return;
	}
	socket.emit('authenticate', { token });
});

socket.on('connect_error', (error) => {
	authStatusEl.textContent = `Socket error: ${error.message || error}`;
	authStatusEl.style.color = '#ef4444';
	if (chatStatusEl) {
		chatStatusEl.textContent = 'Chat connection failed';
	}
});

socket.on('auth_ok', (payload) => {
	state.authenticated = true;
	authStatusEl.textContent = 'Authenticated';
	authStatusEl.style.color = '#2dd4bf';
	userInfoEl.textContent = `User: ${payload.user}`;
	coalitionInfoEl.textContent = `Coalition: ${payload.coalitionId}`;
	state.myCoalitionId = payload.coalitionId;
	state.myName = payload.user;
	setChatEnabled(true);
	addChatMessage('system', `Joined ${payload.coalitionId}`);
});

socket.on('auth_denied', (payload) => {
	state.authenticated = false;
	authStatusEl.textContent = `Auth denied: ${payload.reason}`;
	authStatusEl.style.color = '#ef4444';
	setChatEnabled(false);
});

socket.on('chat_error', (payload) => {
	addChatMessage('system', payload?.reason || 'chat error');
});

socket.on('state_update', (payload) => {
	state.players = payload.players || {};
	state.coin = payload.coin || state.coin;
	const me = state.players[state.me];
	if (me) {
		scoreInfoEl.textContent = `Score: ${me.score}`;
	}
});

socket.on('you_got_item', (payload) => {
	if (payload.sid === state.me) {
		addChatMessage('system', `You got item: ${payload.item}`);
	}
});

socket.on('combat_result', (payload) => {
	if (payload.winner === state.me) {
		addChatMessage('system', 'You won a combat.');
	} else if (payload.loser === state.me) {
		addChatMessage('system', 'You lost a combat.');
	}
});

socket.on('coalition_chat', (payload) => {
	// ignore server echo for messages we already locally displayed
	if (payload && payload.sid && payload.sid === state.me) return;
	addChatMessage(payload.from, payload.message, payload.coalitionId);
});

chatForm.addEventListener('submit', (event) => {
	event.preventDefault();
	if (!state.authenticated) {
		addChatMessage('system', 'Authenticate first.');
		return;
	}
	const message = chatInput.value.trim();
	if (!message) {
		return;
	}
	// local echo using authenticated username when available
	const displayName = state.myName || 'me';
	addChatMessage(displayName, message, state.myCoalitionId);
	socket.emit('coalition_chat', { message });
	chatInput.value = '';
});

logoutBtn.addEventListener('click', () => {
	localStorage.removeItem('cat_jam_jwt');
	window.location.href = '/';
});

// Debug: expose test function to console
window.testMovement = () => {
	console.log('[TEST] Emitting movement to (200, 200)');
	socket.emit('player_movement', { x: 200, y: 200 });
	setTimeout(() => {
		const me = state.players[state.me];
		console.log('[TEST] After emit, position:', me ? {x: me.x, y: me.y} : 'not found');
	}, 100);
};
window.testKeys = () => {
	console.log('[TEST] state.keys:', Array.from(state.keys));
	console.log('[TEST] Simulating W key press');
	window.dispatchEvent(new KeyboardEvent('keydown', {key: 'w', bubbles: true}));
	setTimeout(() => console.log('[TEST] state.keys after W:', Array.from(state.keys)), 50);
};

window.addEventListener('keydown', (e) => {
	state.keys.add(e.key.toLowerCase());
});

window.addEventListener('keyup', (e) => {
	state.keys.delete(e.key.toLowerCase());
});

function addChatMessage(from, text) {
	const p = document.createElement('p');
	p.className = 'chat-msg';
	// determine color for the name if we can infer coalition
	let color = '';
	if (from === state.myName && state.myCoalitionId) {
		color = COALITION_COLORS[state.myCoalitionId] || '';
	}
	// if a coalition was passed in as third arg, handle it (fallback)
	if (arguments.length >= 3 && arguments[2]) {
		color = COALITION_COLORS[arguments[2]] || color;
	}
	const nameSpan = `<span class="chat-from" style="${color ? 'color:'+color+';' : ''}">${escapeHtml(from)}:</span>`;
	p.innerHTML = `${nameSpan} ${escapeHtml(text)}`;
	chatLogEl.appendChild(p);
	chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

function escapeHtml(value) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

function tick() {
	const me = state.players[state.me];
	if (me) {
		const speed = 4;
		let x = me.x;
		let y = me.y;

		if (state.keys.has('arrowup') || state.keys.has('w')) y -= speed;
		if (state.keys.has('arrowdown') || state.keys.has('s')) y += speed;
		if (state.keys.has('arrowleft') || state.keys.has('a')) x -= speed;
		if (state.keys.has('arrowright') || state.keys.has('d')) x += speed;

		if (x !== me.x || y !== me.y) {
			socket.emit('player_movement', { x, y });
		}
	}

	draw();
	requestAnimationFrame(tick);
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	ctx.fillStyle = '#f59e0b';
	ctx.beginPath();
	ctx.arc(state.coin.x, state.coin.y, 10, 0, Math.PI * 2);
	ctx.fill();

	Object.entries(state.players).forEach(([sid, p]) => {
		const isMe = sid === state.me;
		const coalition = p.coalitionId;
		const baseColor = COALITION_COLORS[coalition] || '#9ca3af';
		// highlight self with a brighter outline
		ctx.fillStyle = isMe ? '#2dd4bf' : baseColor;
		ctx.beginPath();
		ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
		ctx.fill();

		// draw label
		ctx.fillStyle = '#e5ecff';
		ctx.font = '12px Segoe UI';
		const label = `${p.user || sid.slice(0, 5)} | ${p.score}${p.item ? ` | ${p.item}` : ''}`;
		ctx.fillText(label, p.x + 14, p.y - 14);
	});
}

tick();
