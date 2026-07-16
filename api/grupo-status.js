/**
 * GET /api/grupo-status
 *
 * Retorna o último snapshot do grupo salvo no Supabase.
 * Exige header x-admin-token.
 *
 * Response 200:
 *   {
 *     ok: true,
 *     last: { membros_total, membros_equipe, membros_ajustado, ultimo_refresh, grupo_nome },
 *     historico: [{ dia: "2026-07-16", pico: 65, ultimo: 65 }, ...]
 *   }
 *   ou { ok: true, last: null } se nunca teve refresh
 */
const crypto = require('crypto');

function verifyToken(req) {
  const provided = String(req.headers['x-admin-token'] || '');
  const expected = String(process.env.ADMIN_TOKEN || '');
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET' });

  if (!verifyToken(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  try {
    // último snapshot
    const lastR = await fetch(
      `${SUPABASE_URL}/rest/v1/grupo_snapshots?select=id,grupo_nome,grupo_id,membros_total,membros_equipe,membros_ajustado,created_at&order=created_at.desc&limit=1`,
      { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } }
    );
    const lastArr = lastR.ok ? await lastR.json() : [];
    const last = lastArr[0] || null;

    // últimos 30 snapshots pra montar mini-histórico
    const histR = await fetch(
      `${SUPABASE_URL}/rest/v1/grupo_snapshots?select=membros_total,membros_ajustado,created_at&order=created_at.desc&limit=30`,
      { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } }
    );
    const historico = histR.ok ? await histR.json() : [];

    // agrupa por dia (mais recente primeiro)
    const porDia = new Map();
    for (const h of historico) {
      const dia = String(h.created_at || '').slice(0, 10);
      if (!dia) continue;
      const cur = porDia.get(dia) || { dia, pico: 0, ultimo: null };
      cur.pico = Math.max(cur.pico, h.membros_total || 0);
      if (cur.ultimo === null) cur.ultimo = h.membros_total || 0;
      porDia.set(dia, cur);
    }
    const historicoArr = [...porDia.values()].sort((a, b) => b.dia.localeCompare(a.dia));

    return res.status(200).json({
      ok: true,
      last: last
        ? {
            grupo_nome: last.grupo_nome,
            grupo_id: last.grupo_id,
            membros_total: last.membros_total,
            membros_equipe: last.membros_equipe,
            membros_ajustado: last.membros_ajustado,
            ultimo_refresh: last.created_at,
          }
        : null,
      historico: historicoArr,
    });
  } catch (e) {
    console.error('[grupo-status] falha', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
