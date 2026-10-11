// GET /api/state — the roster, Points Key, settings, and every KPI Log entry.
const { db, route, toApp, HttpError, SETUP_HINT } = require('./_lib');

const PAGE = 1000; // Supabase returns at most 1,000 rows per request by default

module.exports = route({
  async GET() {
    const [config] = await db('GET', 'config?id=eq.1&select=data,version');
    if (!config) throw new HttpError(503, `The settings row is missing. ${SETUP_HINT}`);
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await db('GET', `activities?select=*&order=position.asc&limit=${PAGE}&offset=${offset}`);
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return { config: config.data, version: config.version, activities: rows.map(toApp) };
  },
});
