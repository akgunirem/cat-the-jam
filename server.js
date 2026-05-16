const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = 3000; 

app.get('/', (req, res) => {
    const authUrl = `https://api.intra.42.fr/oauth/authorize?client_id=${process.env.FORTYTWO_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code`;
    res.send(`<a href="${authUrl}">Log in with 42 API</a>`);
});

app.get('/auth/42/callback', async (req, res) => {
    const authCode = req.query.code;

    try {
        const tokenResponse = await axios.post('https://api.intra.42.fr/oauth/token', {
            grant_type: 'authorization_code',
            client_id: process.env.FORTYTWO_CLIENT_ID,
            client_secret: process.env.FORTYTWO_CLIENT_SECRET,
            code: authCode,
            redirect_uri: process.env.REDIRECT_URI
        });

        const accessToken = tokenResponse.data.access_token;

        const userResponse = await axios.get('https://api.intra.42.fr/v2/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const username = userResponse.data.login;
        const email = userResponse.data.email;
        const profilePic = userResponse.data.image.link;
        const campus = userResponse.data.campus[0]?.name || "Unknown";

        res.send(`
            <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
                <img src="${profilePic}" alt="Profile Picture" style="border-radius: 50%; width: 150px; height: 150px; border: 3px solid #5cb85c; object-fit: cover;">
                <h1 style="color: #333;">Welcome, ${username}! 👋</h1>
                <p style="color: #666; font-size: 18px;">Campus: <strong>${campus}</strong></p>
                <p style="color: #888;">Email: ${email}</p>
                <p style="color: #5cb85c; font-weight: bold;">🎉 The OAuth infrastructure for your Cat-the-Jam project has been successfully set up!</p>
            </div>
        `);
    } catch (error) {
        console.error("Error details:", error.response ? error.response.data : error.message);
        res.status(500).send("🔒 An error occurred while fetching user information from the 42 API!");
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Game server is up and running: http://localhost:${PORT}`);
});