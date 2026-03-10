// api/auth/callback.js
// Handles Discord OAuth2 callback:
// 1. Exchanges code for access token
// 2. Fetches Discord user info
// 3. Upserts user into Supabase 'users' table
// 4. Logs login event to Discord webhook
// 5. Sets secure session cookie
// 6. Redirects back to site

export default async function handler(req, res) {
  const CLIENT_ID     = '1480396125000302726';
  const CLIENT_SECRET = '6k1Omz1o9stRmqCEHf24AG04OBVzWWk8';
  const REDIRECT_URI  = 'https://scriptforge-ai-mocha.vercel.app/api/auth/callback';
  const SUPABASE_URL  = 'https://qoiytmeddkimowkunvou.supabase.co';
  const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvaXl0bWVkZGtpbW93a3Vudm91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDE1MDUsImV4cCI6MjA4ODU3NzUwNX0.RfJD600adcvQZbhq4j3RDF-EZj9A11tTgll-xI8fbMk';
  const DISCORD_WEBHOOK = 'https://discordapp.com/api/webhooks/1480659417748734074/pmnT0Ipejv4lIUR0u5HZxv94orYnNwxCi0mVTUb8B5La9B_nLYpXAhG1tF1J1GJNPGNX';

  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/?error=discord_denied');
  }

  try {
    // ── STEP 1: Exchange code for access token ──────────────
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Token exchange failed:', err);
      return res.redirect('/?error=token_exchange');
    }

    const { access_token } = await tokenRes.json();

    // ── STEP 2: Fetch Discord user info ────────────────────
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userRes.ok) {
      return res.redirect('/?error=user_fetch');
    }

    const discordUser = await userRes.json();
    const avatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || 0) % 5}.png`;

    const now = new Date().toISOString();

    // ── STEP 3: Check if user has a license in Supabase ────
    let licenseData = null;
    try {
      const licRes = await fetch(
        `${SUPABASE_URL}/rest/v1/licenses?discord_id=eq.${discordUser.id}&select=*&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const lics = await licRes.json();
      if (Array.isArray(lics) && lics.length > 0) {
        licenseData = lics[0];
      }
    } catch (e) {
      console.error('License lookup failed:', e);
    }

    // ── STEP 4: Upsert user into 'users' table ─────────────
    const userRow = {
      discord_id:   discordUser.id,
      username:     discordUser.username,
      global_name:  discordUser.global_name || discordUser.username,
      avatar:       avatar,
      plan:         licenseData?.plan || null,
      license_key:  licenseData?.key  || null,
      expires_at:   licenseData?.expires_at || null,
      last_login:   now,
      login_count:  1, // will be incremented by DB trigger or update
    };

    // Try upsert — if it fails because table doesn't exist, we'll handle gracefully
    try {
      // First check if user exists to increment login_count
      const existRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?discord_id=eq.${discordUser.id}&select=login_count`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const existData = await existRes.json();
      if (Array.isArray(existData) && existData.length > 0) {
        userRow.login_count = (existData[0].login_count || 0) + 1;
      }

      await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: {
          apikey:        SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(userRow),
      });
    } catch (e) {
      console.error('User upsert failed (table may not exist yet):', e.message);
      // Non-fatal — continue with login
    }

    // ── STEP 5: Send Discord webhook log ──────────────────
    try {
      const planText = licenseData
        ? `**${licenseData.plan}** — expires ${licenseData.expires_at ? new Date(licenseData.expires_at).toLocaleDateString() : '♾️ Lifetime'}`
        : 'No active plan';

      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '🟢 New Login — ScriptForge AI',
            color: 0x00e5ff,
            thumbnail: { url: avatar },
            fields: [
              { name: '👤 User',       value: `${discordUser.username} (${discordUser.id})`, inline: true },
              { name: '🗓️ Time',       value: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }), inline: true },
              { name: '💎 Plan',       value: planText, inline: false },
              { name: '🔑 Login #',    value: `${userRow.login_count}`, inline: true },
            ],
            footer: { text: 'ScriptForge AI · Web Login' },
            timestamp: now,
          }],
        }),
      });
    } catch (e) {
      console.error('Webhook log failed:', e.message);
      // Non-fatal
    }

    // ── STEP 6: Build session payload & set cookie ─────────
    const sessionData = {
      id:          discordUser.id,
      username:    discordUser.username,
      global_name: discordUser.global_name || discordUser.username,
      avatar:      avatar,
      plan:        licenseData?.plan        || null,
      key:         licenseData?.key         || null,
      expires:     licenseData?.expires_at  || null,
      limit:       licenseData?.plan?.includes('Ultimate') || licenseData?.plan?.includes('Lifetime') ? 99999
                 : licenseData?.plan?.includes('Full Stack') ? 100
                 : licenseData ? 50 : 0,
      login_count: userRow.login_count,
    };

    // Base64-encode session (simple, not cryptographic — upgrade to JWT for production)
    const sessionB64 = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    // Set HttpOnly cookie — valid 7 days
    res.setHeader('Set-Cookie',
      `sf_session=${sessionB64}; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax`
    );

    return res.redirect('/?login=success');

  } catch (err) {
    console.error('Callback error:', err);
    return res.redirect('/?error=server_error');
  }
}
