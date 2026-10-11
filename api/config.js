// PUT /api/config — save the roster, Points Key, and Closed Business settings.
// Body: { config, version, renames: [{ kind: 'member' | 'type', from, to }] }
// `version` must match the saved one, so two people editing settings at once can't overwrite each other.
const { db, route, clean, HttpError } = require('./_lib');

const number = x => (Number.isFinite(Number(x)) ? Number(x) : 0);

function sanitize(c) {
  if (!c || !Array.isArray(c.members) || !Array.isArray(c.key) || !c.multipliers) throw new HttpError(400, 'Incomplete settings.');
  return {
    members: c.members.map(m => ({ name: clean(m.name, 120), goal: Number(m.goal) > 0 ? Number(m.goal) : null })).filter(m => m.name),
    key: c.key.map(k => ({
      type: clean(k.type, 120),
      // Closed Business keeps its text placeholders ("Goal-based"); everything else is a number.
      p1: typeof k.p1 === 'string' && isNaN(Number(k.p1)) ? clean(k.p1, 120) : number(k.p1),
      role1: clean(k.role1, 120) || '',
      p2: typeof k.p2 === 'string' && isNaN(Number(k.p2)) ? clean(k.p2, 120) : number(k.p2),
      role2: clean(k.role2, 120) || '',
      p3: number(k.p3),
      role3: clean(k.role3, 120) || '',
      description: clean(k.description) || '',
    })).filter(k => k.type),
    multipliers: Object.fromEntries(Object.entries(c.multipliers).map(([k, v]) => [clean(k, 40), number(v)]).filter(([k]) => k)),
    refBonus: number(c.refBonus),
  };
}

module.exports = route({
  async PUT(req) {
    const { config, version, renames = [] } = req.body || {};
    if (!Number.isInteger(version)) throw new HttpError(400, 'Missing version.');
    const saved = await db('PATCH', `config?id=eq.1&version=eq.${version}`,
      { data: sanitize(config), version: version + 1, updated_at: new Date().toISOString() }, 'return=representation');
    if (!saved.length) throw new HttpError(409, 'The settings changed since you loaded them.');
    // Renames carry through to past KPI Log entries, which store names as text like the spreadsheet does.
    for (const r of renames) {
      const from = clean(r.from, 120), to = clean(r.to, 120);
      if (!from || !to || from === to) continue;
      const columns = r.kind === 'member' ? ['p1', 'p2', 'p3'] : r.kind === 'type' ? ['type'] : [];
      for (const col of columns) await db('PATCH', `activities?${col}=eq.${encodeURIComponent(from)}`, { [col]: to });
    }
    return { version: version + 1 };
  },
});
