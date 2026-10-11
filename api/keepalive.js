// GET /api/keepalive — run daily by the Vercel cron job in vercel.json.
// Supabase pauses free projects after about a week without activity; one tiny query a day prevents that.
// Returns no group data, so it doesn't need the group passcode. If CRON_SECRET is set in Vercel,
// only Vercel's cron (which sends it as a Bearer token) can call it.
const { db, route, matches, HttpError } = require('./_lib');

module.exports = route({
  async GET(req) {
    const secret = process.env.CRON_SECRET;
    if (secret && !matches(req.headers.authorization, `Bearer ${secret}`)) throw new HttpError(401, 'Not allowed.');
    await db('GET', 'config?id=eq.1&select=id');
    return { ok: true };
  },
}, { skipPasscode: true });
