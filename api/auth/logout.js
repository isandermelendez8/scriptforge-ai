// api/auth/logout.js
// Clears the session cookie and redirects home

export default function handler(req, res) {
  res.setHeader('Set-Cookie', 'sf_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  res.redirect('/');
}
