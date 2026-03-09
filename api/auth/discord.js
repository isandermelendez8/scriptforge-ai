// api/auth/discord.js
// Redirects user to Discord OAuth2 login page

export default function handler(req, res) {
  const CLIENT_ID = '1480396125000302726';
  const REDIRECT_URI = 'https://scriptforge-ai-mocha.vercel.app/api/auth/callback';

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    prompt: 'none', // skip consent if already authorized
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}
