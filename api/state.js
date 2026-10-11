// GET /api/state — the roster, Points Key, settings, every KPI Log entry, and who's signed in.
const { db, route, toApp, publicConfig } = require('./_lib');

const PAGE = 1000; // Supabase returns at most 1,000 rows per request by default

module.exports = route({
  async GET(req, { config, member, isOrganizer, user }) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await db('GET', `activities?select=*&order=position.asc&limit=${PAGE}&offset=${offset}`);
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return {
      config: publicConfig(config.data),
      version: config.version,
      activities: rows.map(toApp),
      me: { memberId: member.id, isOrganizer, email: user.email },
    };
  },
});
