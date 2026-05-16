# Cat the Jam

Cat the Jam is a small multiplayer browser game with 42 OAuth login.

## Architecture

- Node (`server.js`): 42 OAuth login flow, JWT issuance, token verification endpoint.
- Python (`server.py`): Socket.IO game authority (movement, coin pickup, combat, coalition chat).
- Frontend (`index.html`, `game.js`, `style.css`): canvas client with coalition chat.

## Prerequisites

- Node.js 18+
- Python 3.10+

## Environment

Create `.env` in project root:

```env
PORT=3000
FORTYTWO_CLIENT_ID=your_client_id
FORTYTWO_CLIENT_SECRET=your_client_secret
REDIRECT_URI=http://localhost:3000/auth/42/callback
JWT_SECRET=replace_with_random_long_secret
```

## Install

Node dependencies:

```bash
npm install
```

Python dependencies:

```bash
pip install -r requirements.txt
```

## Run

Start Python game server (terminal 1):

```bash
python server.py
```

Start Node auth server (terminal 2):

```bash
npm start
```

Open:

- `http://localhost:3000`

Login with 42, then you are redirected to `/game`.

## Gameplay

- Move: arrow keys or WASD
- Pick coin to get random item
- Collision triggers combat by item hierarchy
- Coalition members can chat in coalition room
