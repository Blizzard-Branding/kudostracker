// Shared helpers for the /api functions. Files starting with "_" aren't deployed as routes.
// The browser never talks to Supabase directly: these functions use the server-only key,
// and the tables have row-level security on with no public policies.
const crypto = require('crypto');

const FIELDS = ['date', 'type', 'p1', 'p2', 'p3', 'r1', 'r2', 'r3', 'notes', 'value'];
const SETUP_HINT = 'Run supabase/schema.sql in the Supabase SQL Editor, then reload.';

function env() {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  };
}

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

const hash = s => crypto.createHash('sha256').update(String(s)).digest();
const matches = (got, want) => crypto.timingSafeEqual(hash(got || ''), hash(want));

const clean = (s, max = 2000) => {
  const t = String(s == null ? '' : s).trim().slice(0, max);
  return t || null;
};

// Calls a Supabase API. `token` is a signed-in user's access token; otherwise the server key is used.
async function supa(method, path, body, { prefer, token } = {}) {
  const { url, key } = env();
  const headers = { apikey: key, 'content-type': 'application/json' };
  const bearer = token || (key.startsWith('eyJ') ? key : null); // legacy JWT keys; new sb_secret_ keys go in apikey only
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (prefer) headers.prefer = prefer;
  const r = await fetch(`${url.replace(/\/$/, '')}/${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!r.ok) {
    const e = new HttpError(r.status, (data && (data.msg || data.message || data.error_description || data.error)) || r.statusText);
    e.upstream = data || {};
    throw e;
  }
  return data;
}

// Supabase's REST API (PostgREST) for the tables.
async function db(method, path, body, prefer) {
  try {
    return await supa(method, `rest/v1/${path}`, body, { prefer });
  } catch (e) {
    if (e.upstream && (e.upstream.code === 'PGRST205' || e.upstream.code === '42P01')) throw new HttpError(503, `The database tables don't exist yet. ${SETUP_HINT}`);
    throw new HttpError(502, `Supabase error ${e.status}: ${e.message}`);
  }
}

// Supabase Auth. Callers translate its errors into messages for people.
const auth = (method, path, body, opts) => supa(method, `auth/v1/${path}`, body, opts);

// ---------- Settings (roster, Points Key, Closed Business settings) ----------
// Members are { id, name, goal, role, userId? }. userId links a roster name to an account and never
// leaves the server; the browser only sees `claimed`.
const newId = () => `m-${crypto.randomBytes(5).toString('hex')}`;

async function saveConfig(version, data) {
  const rows = await db('PATCH', `config?id=eq.1&version=eq.${version}`,
    { data, version: version + 1, updated_at: new Date().toISOString() }, 'return=representation');
  return rows.length ? { data, version: version + 1 } : null;
}

async function loadConfig() {
  const [c] = await db('GET', 'config?id=eq.1&select=data,version');
  if (!c) throw new HttpError(503, `The settings row is missing. ${SETUP_HINT}`);
  if (c.data.members.some(m => !m.id)) { // one-time upgrade: give every member a stable id
    const data = { ...c.data, members: c.data.members.map(m => (m.id ? m : { ...m, id: newId() })) };
    return (await saveConfig(c.version, data)) || loadConfig();
  }
  return c;
}

// Read-modify-write with the version check, retried if someone else saved in between.
async function updateConfig(mutate) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const c = await loadConfig();
    const data = JSON.parse(JSON.stringify(c.data));
    const result = mutate(data);
    const saved = await saveConfig(c.version, data);
    if (saved) return { ...saved, result };
  }
  throw new HttpError(409, 'Too many people are saving at once. Try again in a moment.');
}

const publicConfig = data => ({
  ...data,
  members: data.members.map(({ userId, ...m }) => ({ ...m, role: m.role === 'organizer' ? 'organizer' : 'member', claimed: !!userId })),
});

const nameTaken = (data, name, except) => data.members.some(m => m !== except && m.name.toLowerCase() === name.toLowerCase());

// KPI Log entries store names as text, like the spreadsheet, so renames carry through to them.
async function renameInLog(kind, from, to) {
  if (!from || !to || from === to) return;
  const columns = kind === 'member' ? ['p1', 'p2', 'p3'] : kind === 'type' ? ['type'] : [];
  for (const col of columns) await db('PATCH', `activities?${col}=eq.${encodeURIComponent(from)}`, { [col]: to });
}

const organizerEmails = () => (process.env.ORGANIZER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const isOrganizer = (member, user) => (member && member.role === 'organizer') || organizerEmails().includes(((user && user.email) || '').toLowerCase());

function requirePasscode(passcode) {
  const want = process.env.GROUP_PASSCODE;
  if (!want) throw new HttpError(503, 'Sign-ups are closed until an organizer sets GROUP_PASSCODE in Vercel.');
  if (!matches(passcode, want)) throw new HttpError(403, 'That group passcode isn’t right.');
}

// Links an account to a roster name (existing or new). Mutates `data`; returns a rename to apply, if any.
function claimInto(data, userId, { claimId, name, goal }) {
  if (data.members.some(m => m.userId === userId)) throw new HttpError(409, 'Your account already has a profile.');
  const publicName = clean(name, 120);
  if (!publicName) throw new HttpError(400, 'Enter the name the group should see.');
  const g = Number(goal) > 0 ? Number(goal) : null;
  // With no organizers configured anywhere, the first person to join becomes one.
  const firstOrganizer = !organizerEmails().length && !data.members.some(m => m.role === 'organizer');
  let m, rename = null;
  if (claimId) {
    m = data.members.find(x => x.id === claimId);
    if (!m) throw new HttpError(404, 'That roster name no longer exists. Reload and pick again.');
    if (m.userId) throw new HttpError(409, 'Someone already claimed that name. If that’s a mistake, ask an organizer.');
    if (m.name !== publicName) rename = { kind: 'member', from: m.name, to: publicName };
  } else {
    m = { id: newId(), role: 'member' };
    data.members.push(m);
  }
  if (nameTaken(data, publicName, m)) throw new HttpError(409, 'Another member already uses that name. If it’s you, pick it from the roster.');
  Object.assign(m, { name: publicName, goal: g, userId, role: firstOrganizer ? 'organizer' : (m.role === 'organizer' ? 'organizer' : 'member') });
  return rename;
}

// ---------- Sessions ----------
async function getUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new HttpError(401, 'Please sign in.');
  try {
    const u = await auth('GET', 'user', undefined, { token });
    return { id: u.id, email: u.email || '' };
  } catch (e) {
    if (e.status >= 500) throw new HttpError(502, 'Supabase sign-in is having trouble. Try again in a moment.');
    throw new HttpError(401, 'Your session has ended. Please sign in again.');
  }
}

const toSession = d => ({
  access_token: d.access_token,
  refresh_token: d.refresh_token,
  expires_in: d.expires_in || 3600,
});

async function passwordGrant(email, password) {
  try {
    return toSession(await auth('POST', 'token?grant_type=password', { email, password }));
  } catch (e) {
    if (e.status >= 500) throw new HttpError(502, 'Supabase sign-in is having trouble. Try again in a moment.');
    if (e.status === 429) throw new HttpError(429, 'Too many sign-in attempts. Wait a few minutes and try again.');
    throw new HttpError(401, 'That email and password don’t match.');
  }
}

// Wraps a handler with method checks, configuration, sign-in and permission checks, and JSON errors.
// access: 'public' (no sign-in), 'user' (signed in), 'member' (signed in and on the roster), 'organizer'.
function route(handlers, { access = 'member' } = {}) {
  return async (req, res) => {
    try {
      const handler = handlers[req.method];
      if (!handler) throw new HttpError(405, 'Method not allowed.');
      const { url, key } = env();
      if (!url || !key) throw new HttpError(503, 'Supabase isn\'t connected to this Vercel project (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing).');
      const ctx = {};
      if (access !== 'public') {
        ctx.user = await getUser(req);
        if (access !== 'user') {
          ctx.config = await loadConfig();
          ctx.member = ctx.config.data.members.find(m => m.userId === ctx.user.id);
          if (!ctx.member) throw new HttpError(403, 'Finish setting up your profile first.', 'profile_needed');
          ctx.isOrganizer = isOrganizer(ctx.member, ctx.user);
          if (access === 'organizer' && !ctx.isOrganizer) throw new HttpError(403, 'Only organizers can change this.');
        }
      }
      res.status(200).json(await handler(req, ctx));
    } catch (e) {
      if (!e.status) console.error(e);
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong on the server.', code: e.code });
    }
  };
}

// ---------- KPI Log rows ----------
// App shape (camelCase, '' for blanks) <-> table row (snake_case, null for blanks).
function toApp(row) {
  const a = { id: row.id, jobSize: row.job_size || '', seeded: !!row.seeded };
  FIELDS.forEach(f => { a[f] = row[f] == null ? '' : String(row[f]); });
  return a;
}

function toRow(a) {
  if (!a || typeof a !== 'object') throw new HttpError(400, 'Missing activity.');
  const row = { job_size: clean(a.jobSize, 40) };
  FIELDS.forEach(f => { row[f] = clean(a[f]); });
  if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new HttpError(400, 'Dates must look like 2026-09-16.');
  if (!row.type || !row.p1) throw new HttpError(400, 'Every entry needs a KPI type and Person 1.');
  return row;
}

module.exports = {
  db, auth, route, matches, clean, HttpError, SETUP_HINT,
  newId, loadConfig, saveConfig, updateConfig, publicConfig, nameTaken, renameInLog,
  organizerEmails, requirePasscode, claimInto, getUser, toSession, passwordGrant, toApp, toRow,
};
