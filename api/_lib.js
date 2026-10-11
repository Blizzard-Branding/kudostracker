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
  constructor(status, message) { super(message); this.status = status; }
}

// Calls Supabase's REST API (PostgREST).
async function db(method, path, body, prefer) {
  const { url, key } = env();
  const headers = { apikey: key, 'content-type': 'application/json' };
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`; // legacy JWT keys; new sb_secret_ keys go in apikey only
  if (prefer) headers.prefer = prefer;
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    if (data && (data.code === 'PGRST205' || data.code === '42P01')) throw new HttpError(503, `The database tables don't exist yet. ${SETUP_HINT}`);
    throw new HttpError(502, `Supabase error ${r.status}: ${(data && data.message) || r.statusText}`);
  }
  return data;
}

// Wraps a handler with method checks, configuration and passcode checks, and JSON errors.
function route(handlers) {
  return async (req, res) => {
    try {
      const handler = handlers[req.method];
      if (!handler) throw new HttpError(405, 'Method not allowed.');
      const { url, key } = env();
      if (!url || !key) throw new HttpError(503, 'Supabase isn\'t connected to this Vercel project (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing).');
      const want = process.env.GROUP_PASSCODE;
      if (want) {
        const hash = s => crypto.createHash('sha256').update(String(s)).digest();
        if (!crypto.timingSafeEqual(hash(req.headers['x-group-passcode'] || ''), hash(want))) throw new HttpError(401, 'Passcode required.');
      }
      res.status(200).json(await handler(req));
    } catch (e) {
      if (!e.status) console.error(e);
      res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong on the server.' });
    }
  };
}

const clean = (s, max = 2000) => {
  const t = String(s == null ? '' : s).trim().slice(0, max);
  return t || null;
};

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

module.exports = { db, route, toApp, toRow, clean, HttpError, SETUP_HINT };
