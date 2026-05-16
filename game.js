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
const chatLogEl = document.getElementById('chatLog');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const logoutBtn = document.getElementById('logoutBtn');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const state = {
	me: null,
	players: {},
	coin: { x: 400, y: 300 },
	myCoalitionId: null,
	keys: new Set()
};

if (!token) {
	authStatusEl.textContent = 'No login token found. Please login from /';
	authStatusEl.style.color = '#ef4444';
}

const socket = io('http://localhost:5000', {
	transports: ['websocket', 'polling']
});

socket.on('connect', () => {
	state.me = socket.id;
	if (!token) {
		return;
	}
	socket.emit('authenticate', { token });
});

socket.on('auth_ok', (payload) => {
	authStatusEl.textContent = 'Authenticated';
	authStatusEl.style.color = '#2dd4bf';
	userInfoEl.textContent = `User: ${payload.user}`;
	coalitionInfoEl.textContent = `Coalition: ${payload.coalitionId}`;
	state.myCoalitionId = payload.coalitionId;
	addChatMessage('system', `Joined ${payload.coalitionId}`);
});

socket.on('auth_denied', (payload) => {
	authStatusEl.textContent = `Auth denied: ${payload.reason}`;
	authStatusEl.style.color = '#ef4444';
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
	addChatMessage(payload.from, payload.message);
});

chatForm.addEventListener('submit', (event) => {
	event.preventDefault();
	const message = chatInput.value.trim();
	if (!message) {
		return;
	}
	socket.emit('coalition_chat', { message });
	chatInput.value = '';
});

logoutBtn.addEventListener('click', () => {
	localStorage.removeItem('cat_jam_jwt');
	window.location.href = '/';
});

window.addEventListener('keydown', (e) => {
	state.keys.add(e.key.toLowerCase());
});

window.addEventListener('keyup', (e) => {
	state.keys.delete(e.key.toLowerCase());
});

function addChatMessage(from, text) {
	const p = document.createElement('p');
	p.className = 'chat-msg';
	p.innerHTML = `<span class="chat-from">${escapeHtml(from)}:</span> ${escapeHtml(text)}`;
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
		const isAlly = state.myCoalitionId && p.coalitionId === state.myCoalitionId;
		ctx.fillStyle = isMe ? '#2dd4bf' : isAlly ? '#60a5fa' : '#f43f5e';
		ctx.beginPath();
		ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
		ctx.fill();

		ctx.fillStyle = '#e5ecff';
		ctx.font = '12px Segoe UI';
		const label = `${p.user || sid.slice(0, 5)} | ${p.score}${p.item ? ` | ${p.item}` : ''}`;
		ctx.fillText(label, p.x + 14, p.y - 14);
	});
}

tick();
