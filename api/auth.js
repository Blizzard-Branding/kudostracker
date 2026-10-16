// POST /api/auth — accounts. Body: { action, ... }
//   roster   { passcode }                                   unclaimed roster names, for the sign-up form
//   signup   { email, password, passcode, claimId, name, goal }
//   login    { email, password }
//   refresh  { refresh_token }
//   logout   (Authorization header)
//   password { current, next } (Authorization header)
//   features                                                 which optional features are on
//   forgot   { email }                                       email a password reset link and code
//   recover  { access_token } or { email, code }, password   set a new password from that email
// Accounts are created here with the server key, already confirmed, because Supabase's built-in
// email only reaches the project's own team. The group passcode gates who can join.
// Password reset emails need custom SMTP in Supabase (see the README), so they stay off until
// EMAIL_PASSWORD_RESET=on.
const {
  auth, route, clean, HttpError, loadConfig, updateConfig, claimInto, renameInLog,
  requirePasscode, getUser, toSession, passwordGrant,
} = require('./_lib');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const checkPassword = p => {
  if (typeof p !== 'string' || p.length < 8) throw new HttpError(400, 'Use a password with at least 8 characters.');
  if (p.length > 72) throw new HttpError(400, 'Use a password with 72 characters or fewer.');
};

const emailResetOn = () => process.env.EMAIL_PASSWORD_RESET === 'on';

// Sends the person back to whichever address they used (vercel.app or the custom domain).
// Supabase only follows it if the address is in its Redirect URLs list; otherwise it uses the Site URL.
function appUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (/^(localhost|127\.)/.test(host || '') ? 'http' : 'https');
  return `${proto}://${host}/`;
}

// A session from a reset link carries a "recovery" sign-in method in its token. Requiring it means an
// ordinary signed-in session can't be used to change the password without the current one.
function isRecentRecovery(token) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return (claims.amr || []).some(a => a.method === 'recovery' && Date.now() / 1000 - a.timestamp < 3600);
  } catch {
    return false;
  }
}

const actions = {
  async roster({ passcode }) {
    requirePasscode(passcode);
    const { data } = await loadConfig();
    return { members: data.members.filter(m => !m.userId).map(({ id, name, goal }) => ({ id, name, goal })) };
  },

  async signup(b) {
    requirePasscode(b.passcode);
    const email = (clean(b.email, 254) || '').toLowerCase();
    if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    checkPassword(b.password);
    // Check the profile first, so a taken name doesn't leave an orphaned account behind.
    const { data } = await loadConfig();
    claimInto(JSON.parse(JSON.stringify(data)), 'pending', b);

    let user;
    try {
      user = await auth('POST', 'admin/users', { email, password: b.password, email_confirm: true });
    } catch (e) {
      if (e.status === 422 || /already|exists|registered/i.test(e.message)) throw new HttpError(409, 'An account with that email already exists. Sign in instead.');
      throw new HttpError(502, `Couldn’t create the account: ${e.message}`);
    }
    try {
      const { result: rename } = await updateConfig(d => claimInto(d, user.id, b));
      if (rename) await renameInLog(rename.kind, rename.from, rename.to);
    } catch (e) {
      await auth('DELETE', `admin/users/${user.id}`).catch(() => {});
      throw e;
    }
    return { session: await passwordGrant(email, b.password) };
  },

  async login({ email, password }) {
    if (!email || !password) throw new HttpError(400, 'Enter your email and password.');
    return { session: await passwordGrant(String(email).trim().toLowerCase(), String(password)) };
  },

  async refresh({ refresh_token: token }) {
    if (!token) throw new HttpError(401, 'Please sign in.');
    try {
      return { session: toSession(await auth('POST', 'token?grant_type=refresh_token', { refresh_token: token })) };
    } catch (e) {
      if (e.status >= 500) throw new HttpError(502, 'Supabase sign-in is having trouble. Try again in a moment.');
      throw new HttpError(401, 'Your session has ended. Please sign in again.');
    }
  },

  async logout(b, req) {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) await auth('POST', 'logout', undefined, { token: h.slice(7) }).catch(() => {});
    return { ok: true };
  },

  async password({ current, next }, req) {
    const user = await getUser(req);
    checkPassword(next);
    try {
      await passwordGrant(user.email, String(current || ''));
    } catch (e) {
      if (e.status === 401) throw new HttpError(400, 'Your current password isn’t right.');
      throw e;
    }
    await auth('PUT', `admin/users/${user.id}`, { password: next });
    return { ok: true };
  },
};

Object.assign(actions, {
  features() {
    return { emailReset: emailResetOn() };
  },

  async forgot({ email }, req) {
    if (!emailResetOn()) throw new HttpError(503, 'Password reset by email isn’t set up yet. Ask an organizer to set a temporary password for you.');
    const address = (clean(email, 254) || '').toLowerCase();
    if (!EMAIL.test(address)) throw new HttpError(400, 'Enter a valid email address.');
    try {
      await auth('POST', `recover?redirect_to=${encodeURIComponent(appUrl(req))}`, { email: address });
    } catch (e) {
      if (e.status === 429) throw new HttpError(429, 'Too many reset emails were sent. Wait a few minutes, then try again.');
      console.error('recover failed', e.status, e.message);
      throw new HttpError(502, 'Couldn’t send the reset email. Try again in a few minutes, or ask an organizer to set a temporary password.');
    }
    // Same answer whether or not the email has an account, so nobody can probe for members.
    return { ok: true };
  },

  async recover(b) {
    checkPassword(b.password);
    let user, token;
    if (b.access_token) { // from the emailed link
      token = String(b.access_token);
      const expired = new HttpError(400, 'That reset link has expired or was already used. Request a new one.');
      try {
        const u = await auth('GET', 'user', undefined, { token }); // Supabase checks the token is genuine
        user = { id: u.id, email: u.email };
      } catch (e) {
        throw expired;
      }
      if (!isRecentRecovery(token)) throw expired;
    } else { // from the 6-digit code
      const email = (clean(b.email, 254) || '').toLowerCase();
      const code = String(b.code || '').replace(/\s/g, '');
      if (!EMAIL.test(email) || !/^\d{6,10}$/.test(code)) throw new HttpError(400, 'Enter your email and the code from the reset email.');
      try {
        const d = await auth('POST', 'verify', { type: 'recovery', email, token: code });
        token = d.access_token;
        user = { id: d.user.id, email: d.user.email };
      } catch (e) {
        if (e.status === 429) throw new HttpError(429, 'Too many tries. Wait a few minutes, then try again.');
        throw new HttpError(400, 'That code is wrong or has expired. Request a new one.');
      }
    }
    await auth('PUT', `admin/users/${user.id}`, { password: b.password });
    // Sign out every other device: a forgotten password can mean someone else had it.
    await auth('POST', 'logout?scope=global', undefined, { token }).catch(() => {});
    return { session: await passwordGrant(user.email, b.password) };
  },
});

module.exports = route({
  async POST(req) {
    const b = req.body || {};
    const action = Object.hasOwn(actions, b.action) ? actions[b.action] : null;
    if (!action) throw new HttpError(400, 'Unknown action.');
    return action(b, req);
  },
}, { access: 'public' });
