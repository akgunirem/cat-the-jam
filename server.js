const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
dotenv.config({ path: '.env', override: true });

const app = express();
const PORT = 3000;
const CLIENT_ID = (process.env.FORTYTWO_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.FORTYTWO_CLIENT_SECRET || '').trim();
const REDIRECT_URI = (process.env.REDIRECT_URI || '').trim();
const JWT_SECRET = (process.env.JWT_SECRET || '').trim();

app.use(express.json());

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !JWT_SECRET) {
    console.error('Missing OAuth env values. Check FORTYTWO_CLIENT_ID, FORTYTWO_CLIENT_SECRET, REDIRECT_URI.');
}

async function exchangeToken(authCode) {
    const baseParams = {
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: REDIRECT_URI
    };

    const attempts = [
        {
            name: 'form-with-basic-auth',
            data: new URLSearchParams(baseParams).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
            }
        },
        {
            name: 'form-with-client-in-body',
            data: new URLSearchParams({
                ...baseParams,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            }).toString(),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        },
        {
            name: 'json-with-client-in-body',
            data: {
                ...baseParams,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET
            },
            headers: {
                'Content-Type': 'application/json'
            }
        }
    ];

    let lastErr;
    for (const attempt of attempts) {
        try {
            console.log('Trying token exchange method:', attempt.name);
            return await axios.post('https://api.intra.42.fr/oauth/token', attempt.data, {
                headers: attempt.headers
            });
        } catch (err) {
            lastErr = err;
            const detail = err.response ? err.response.data : err.message;
            console.log('Token method failed:', attempt.name, detail);
        }
    }

    throw lastErr;
}

app.get('/', (req, res) => {
    const authUrl = `https://api.intra.42.fr/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code`;
    console.log('AUTH URL generated:', authUrl);
    res.send(`
        <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 48px;">
            <h1>Cat the Jam</h1>
            <p>42 hesabinizla giris yapip oyuna katilin.</p>
            <a href="${authUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">Log in with 42 API</a>
        </div>
    `);
});

app.get('/game', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/auth/42/callback', async (req, res) => {
    const authCode = req.query.code;

    if (!authCode) {
        return res.status(400).send('Missing authorization code.');
    }

    try {
        const tokenResponse = await exchangeToken(authCode);

        const accessToken = tokenResponse.data.access_token;

        const userResponse = await axios.get('https://api.intra.42.fr/v2/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const username = userResponse.data.login;
        const email = userResponse.data.email;
        const profilePic = userResponse.data.image.link;
        const campus = userResponse.data.campus[0]?.name || "Unknown";

        const token = jwt.sign(
            {
                sub: username,
                email,
                campus
            },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.send(`
            <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
                <img src="${profilePic}" alt="Profile Picture" style="border-radius: 50%; width: 150px; height: 150px; border: 3px solid #5cb85c; object-fit: cover;">
                <h1 style="color: #333;">Welcome, ${username}!</h1>
                <p style="color: #666; font-size: 18px;">Campus: <strong>${campus}</strong></p>
                <p style="color: #888;">Email: ${email}</p>
                <p style="color: #5cb85c; font-weight: bold;">OAuth ok. Redirecting to game...</p>
            </div>
            <script>
                const jwtToken = ${JSON.stringify(token)};
                try {
                    localStorage.setItem('cat_jam_jwt', jwtToken);
                } catch (e) {
                    console.warn('localStorage unavailable, fallback to query token');
                }
                window.location.href = '/game?token=' + encodeURIComponent(jwtToken);
            </script>
        `);
    } catch (error) {
        console.error("Error details:", error.response ? error.response.data : error.message);
        res.status(500).send("🔒 An error occurred while fetching user information from the 42 API!");
    }
});

app.post('/verify-token', (req, res) => {
    const token = req.body?.token;
    if (!token) {
        return res.status(400).json({ ok: false, error: 'missing token' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        return res.json({ ok: true, payload });
    } catch (err) {
        return res.status(401).json({ ok: false, error: 'invalid token' });
    }
});

app.use(express.static(__dirname));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Game server is up and running: http://localhost:${PORT}`);
    console.log(`OAuth config loaded. client_id_prefix=${CLIENT_ID.slice(0, 12)}..., redirect_uri=${REDIRECT_URI}`);
});
