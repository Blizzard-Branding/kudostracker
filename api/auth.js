// POST /api/auth — accounts. Body: { action, ... }
//   roster   { passcode }                                   unclaimed roster names, for the sign-up form
//   signup   { email, password, passcode, claimId, name, goal }
//   login    { email, password }
//   refresh  { refresh_token }
//   logout   (Authorization header)
//   password { current, next } (Authorization header)
// Accounts are created here with the server key, already confirmed, because Supabase's built-in
// email only reaches the project's own team. The group passcode gates who can join.
const {
  auth, route, clean, HttpError, loadConfig, updateConfig, claimInto, renameInLog,
  requirePasscode, getUser, toSession, passwordGrant,
} = require('./_lib');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const checkPassword = p => {
  if (typeof p !== 'string' || p.length < 8) throw new HttpError(400, 'Use a password with at least 8 characters.');
  if (p.length > 72) throw new HttpError(400, 'Use a password with 72 characters or fewer.');
};

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

module.exports = route({
  async POST(req) {
    const b = req.body || {};
    const action = Object.hasOwn(actions, b.action) ? actions[b.action] : null;
    if (!action) throw new HttpError(400, 'Unknown action.');
    return action(b, req);
  },
}, { access: 'public' });
