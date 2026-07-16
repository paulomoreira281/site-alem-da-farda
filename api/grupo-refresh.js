/**
 * POST /api/grupo-refresh
 *
 * Consulta a Z-API pelo metadata do grupo WhatsApp (pelo link de convite),
 * grava um novo snapshot em `grupo_snapshots` e retorna a contagem atual.
 *
 * Exige header x-admin-token.
 *
 * Body opcional (JSON):
 *   { "membros_equipe": 7 }   // desconta X pessoas do total (admin/equipe)
 *
 * Env vars:
 *   ZAPI_INSTANCE_ID
 *   ZAPI_TOKEN
 *   ZAPI_CLIENT_TOKEN
 *   GRUPO_URL             (link de convite)
 *   GRUPO_EQUIPE_COUNT    (default 0 — pode ser sobrescrito pelo body)
 *   ADMIN_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Response 200:
 *   {
 *     ok: true,
 *     grupo_nome: "Imersão Polícia Civil 2026 - (28/07)",
 *     grupo_id: "120363410565455258-group",
 *     membros_total: 65,
 *     membros_equipe: 7,
 *     membros_ajustado: 58,
 *     ultimo_refresh: "2026-07-16T15:20:00Z",
 *     participants_count: 65,
 *     snapshot_id: "uuid"
 *   }
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

async function fetchGroupFromZapi() {
  const instance = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  const grupoUrl = process.env.GRUPO_URL;

  if (!instance || !token || !clientToken || !grupoUrl) {
    throw new Error('env_missing_zapi');
  }

  const url = `https://api.z-api.io/instances/${instance}/token/${token}/group-invitation-metadata?url=${encodeURIComponent(grupoUrl)}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, {
      headers: { 'Client-Token': clientToken },
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`zapi_${r.status}: ${text.slice(0, 200)}`);
    }
    return await r.json();
  } catch (e) {
    clearTimeout(to);
    throw e;
  }
}

async function saveSnapshot(data) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/grupo_snapshots`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`supabase_${resp.status}: ${text.slice(0, 200)}`);
  }
  const j = await resp.json();
  return j?.[0] || null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

  if (!verifyToken(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const body = req.body || {};
  const equipeOverride = Number.isInteger(body.membros_equipe) ? body.membros_equipe : null;
  const equipeDefault = parseInt(process.env.GRUPO_EQUIPE_COUNT || '0', 10) || 0;
  const membrosEquipe = equipeOverride !== null ? equipeOverride : equipeDefault;

  try {
    const meta = await fetchGroupFromZapi();
    const membrosTotal = Number(meta.participantsCount) || (meta.participants?.length || 0);
    const participants = meta.participants || [];

    const snapshot = await saveSnapshot({
      grupo_url: process.env.GRUPO_URL,
      grupo_nome: meta.subject || null,
      grupo_id: meta.phone || null,
      membros_total: membrosTotal,
      membros_equipe: membrosEquipe,
      participants_raw: participants,
    });

    return res.status(200).json({
      ok: true,
      grupo_nome: meta.subject,
      grupo_id: meta.phone,
      membros_total: membrosTotal,
      membros_equipe: membrosEquipe,
      membros_ajustado: membrosTotal - membrosEquipe,
      participants_count: participants.length,
      snapshot_id: snapshot?.id,
      ultimo_refresh: snapshot?.created_at,
    });
  } catch (e) {
    console.error('[grupo-refresh] falha', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
