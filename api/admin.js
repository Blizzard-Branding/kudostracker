// POST /api/admin — organizer actions on someone else's account. Body: { action, memberId, ... }
//   resetPassword { password }  set a temporary password (Supabase can't email group members)
//   removeAccount               delete the account linked to a roster name; their entries stay
const { auth, route, HttpError, updateConfig, publicConfig } = require('./_lib');

module.exports = route({
  async POST(req, { config, user }) {
    const b = req.body || {};
    const m = config.data.members.find(x => x.id === b.memberId);
    if (!m) throw new HttpError(404, 'That member isn’t on the roster anymore.');
    if (!m.userId) throw new HttpError(400, `${m.name} doesn’t have an account yet.`);

    if (b.action === 'resetPassword') {
      if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 72) throw new HttpError(400, 'Use a temporary password with 8 to 72 characters.');
      await auth('PUT', `admin/users/${m.userId}`, { password: b.password });
      return { ok: true };
    }

    if (b.action === 'removeAccount') {
      if (m.userId === user.id) throw new HttpError(400, 'You can’t remove your own account here.');
      const saved = await updateConfig(d => {
        const x = d.members.find(y => y.id === m.id);
        if (x) delete x.userId;
      });
      await auth('DELETE', `admin/users/${m.userId}`).catch(e => { if (e.status !== 404) throw new HttpError(502, `Couldn’t delete the account: ${e.message}`); });
      return { version: saved.version, config: publicConfig(saved.data) };
    }

    throw new HttpError(400, 'Unknown action.');
  },
}, { access: 'organizer' });
