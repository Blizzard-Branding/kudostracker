// POST /api/activities          — add one entry (or an array of entries)
// PUT /api/activities?id=…      — replace an entry
// DELETE /api/activities?id=…   — delete an entry
// Any signed-in member can log, edit, or delete entries for anyone, like the spreadsheet.
const { db, route, toApp, toRow, HttpError } = require('./_lib');

const RETURN = 'return=representation';
const byId = req => {
  if (!req.query.id) throw new HttpError(400, 'Missing id.');
  return `activities?id=eq.${encodeURIComponent(req.query.id)}`;
};
const one = rows => {
  if (!rows.length) throw new HttpError(404, 'That entry no longer exists. Someone may have deleted it.');
  return toApp(rows[0]);
};

module.exports = route({
  async POST(req) {
    const list = Array.isArray(req.body) ? req.body : [req.body];
    if (!list.length || list.length > 500) throw new HttpError(400, 'Send between 1 and 500 entries.');
    const rows = (await db('POST', 'activities', list.map(toRow), RETURN)).map(toApp);
    return Array.isArray(req.body) ? rows : rows[0];
  },
  async PUT(req) {
    return one(await db('PATCH', byId(req), toRow(req.body), RETURN));
  },
  async DELETE(req) {
    one(await db('DELETE', byId(req), undefined, RETURN));
    return { ok: true };
  },
});
