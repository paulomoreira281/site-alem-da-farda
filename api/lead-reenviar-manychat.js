/**
 * POST /api/lead-reenviar-manychat
 *
 * Reenvia o flow ManyChat pra um lead específico (via id do Supabase).
 * Útil pra retry de leads que falharam.
 *
 * Body: { "lead_id": "uuid" }
 * Exige header x-admin-token.
 */
const crypto = require('crypto');
const { createAndSendFlow } = require('./_lib/manychat');

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
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

  if (!verifyToken(req)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const body = req.body || {};
  const leadId = String(body.lead_id || '').trim();
  if (!leadId) return res.status(400).json({ ok: false, error: 'lead_id obrigatório' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured' });
  }

  try {
    // busca o lead
    const r = await fetch(`${SUPABASE_URL}/rest/v1/leads_live_carla?id=eq.${leadId}&select=id,nome,whatsapp,manychat_status,manychat_subscriber_id`, {
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
    });
    if (!r.ok) return res.status(500).json({ ok: false, error: 'supabase_error' });
    const arr = await r.json();
    const lead = arr[0];
    if (!lead) return res.status(404).json({ ok: false, error: 'lead_not_found' });

    // dispara
    const result = await createAndSendFlow({ nome: lead.nome, whatsapp: lead.whatsapp });

    // patch status
    await fetch(`${SUPABASE_URL}/rest/v1/leads_live_carla?id=eq.${leadId}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        manychat_status: result.status,
        manychat_subscriber_id: result.subscriber_id,
      }),
    }).catch((e) => console.warn('[reenviar-mc] patch falhou', e.message));

    return res.status(200).json({
      ok: true,
      manychat: result.status,
      subscriber_id: result.subscriber_id,
    });
  } catch (e) {
    console.error('[reenviar-mc] falha', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
