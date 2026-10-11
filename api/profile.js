// /api/profile — the signed-in person's own roster entry.
//   POST { passcode, claimId, name, goal }  link this account to the roster (when sign-up didn't finish it)
//   PUT  { name, goal }                     change your public name and annual goal
// Linking needs the group passcode too, so an account made any other way can't get in.
const { route, clean, HttpError, updateConfig, publicConfig, nameTaken, claimInto, renameInLog, requirePasscode } = require('./_lib');

module.exports = route({
  async POST(req, { user }) {
    const b = req.body || {};
    requirePasscode(b.passcode);
    const { result: rename } = await updateConfig(d => claimInto(d, user.id, b));
    if (rename) await renameInLog(rename.kind, rename.from, rename.to);
    return { ok: true };
  },

  async PUT(req, { user }) {
    const b = req.body || {};
    const name = clean(b.name, 120);
    if (!name) throw new HttpError(400, 'Enter the name the group should see.');
    const goal = Number(b.goal) > 0 ? Number(b.goal) : null;
    const saved = await updateConfig(d => {
      const m = d.members.find(x => x.userId === user.id);
      if (!m) throw new HttpError(403, 'Finish setting up your profile first.', 'profile_needed');
      if (nameTaken(d, name, m)) throw new HttpError(409, 'Another member already uses that name.');
      const rename = m.name !== name ? { kind: 'member', from: m.name, to: name } : null;
      Object.assign(m, { name, goal });
      return rename;
    });
    if (saved.result) await renameInLog(saved.result.kind, saved.result.from, saved.result.to);
    return { version: saved.version, config: publicConfig(saved.data) };
  },
}, { access: 'user' });
