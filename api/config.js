// PUT /api/config — organizers save the roster, Points Key, and Closed Business settings.
// Body: { config, version, renames: [{ kind: 'member' | 'type', from, to }] }
// `version` must match the saved one, so two people editing settings at once can't overwrite each other.
// Account links (userId) are kept server-side and can't be set from here.
const { route, clean, HttpError, loadConfig, saveConfig, publicConfig, newId, organizerEmails, renameInLog } = require('./_lib');

const number = x => (Number.isFinite(Number(x)) ? Number(x) : 0);

function sanitize(c, current) {
  if (!c || !Array.isArray(c.members) || !Array.isArray(c.key) || !c.multipliers) throw new HttpError(400, 'Incomplete settings.');
  const members = c.members.map(m => {
    const name = clean(m.name, 120);
    if (!name) return null;
    const old = current.members.find(o => o.id === m.id);
    return {
      id: old ? old.id : newId(),
      name,
      goal: Number(m.goal) > 0 ? Number(m.goal) : null,
      role: m.role === 'organizer' ? 'organizer' : 'member',
      ...(old && old.userId ? { userId: old.userId } : {}),
    };
  }).filter(Boolean);
  const names = members.map(m => m.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new HttpError(400, 'Two members can’t share a name.');
  if (!organizerEmails().length && !members.some(m => m.role === 'organizer')) throw new HttpError(400, 'Keep at least one organizer.');
  return {
    members,
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
    const current = await loadConfig();
    if (current.version !== version) throw new HttpError(409, 'The settings changed since you loaded them.');
    const saved = await saveConfig(version, sanitize(config, current.data));
    if (!saved) throw new HttpError(409, 'The settings changed since you loaded them.');
    for (const r of renames) await renameInLog(r.kind, clean(r.from, 120), clean(r.to, 120));
    return { version: saved.version, config: publicConfig(saved.data) };
  },
}, { access: 'organizer' });
