// api/auth/me.js
// Returns the current logged-in user from session cookie

export default function handler(req, res) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/sf_session=([^;]+)/);

  if (!match) {
    return res.status(200).json({ user: null });
  }

  try {
    const sessionData = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    return res.status(200).json({ user: sessionData });
  } catch (e) {
    return res.status(200).json({ user: null });
  }
}
