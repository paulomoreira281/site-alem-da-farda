/**
 * GET /api/leads-summary
 *
 * Retorna KPIs e agregados dos leads pra popular o dashboard admin.
 * Exige header x-admin-token.
 *
 * Query params:
 *   from: ISO date (default: 30 dias atrás)
 *   to:   ISO date (default: agora)
 *
 * Response 200:
 *   {
 *     ok: true,
 *     total_periodo, total_hoje, total_7d, sem_utm, com_utm,
 *     por_utm_source:   [{ key, count }, ...],
 *     por_utm_campaign: [{ key, count }, ...],
 *     por_utm_medium:   [{ key, count }, ...],
 *     por_dia:          [{ dia: 'YYYY-MM-DD', count }, ...],
 *     por_device:       [{ key, count }, ...]
 *   }
 *
 * Agregação em Node (buscando todas as linhas do período — limite 10k).
 * Se volume crescer muito, migrar pra view SQL leads_summary_v.
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

function countBy(arr, keyFn) {
  const map = new Map();
  for (const r of arr) {
    const k = keyFn(r);
    if (k === null || k === undefined || k === '') continue;
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
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

  const url = new URL(req.url, 'http://x');
  const q = url.searchParams;

  // default: últimos 30 dias
  const now = new Date();
  const from = q.get('from') || new Date(now.getTime() - 30 * 864e5).toISOString();
  const to = q.get('to') || now.toISOString();

  const parts = [
    'select=created_at,utm_source,utm_medium,utm_campaign,utm_content,device_type',
    `order=created_at.desc`,
    'limit=10000',
    `created_at=gte.${encodeURIComponent(from)}`,
    `created_at=lte.${encodeURIComponent(to)}`,
  ];

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/leads_live_carla?${parts.join('&')}`, {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[leads-summary] supabase', resp.status, text.slice(0, 300));
      return res.status(500).json({ ok: false, error: 'supabase_error' });
    }

    const rows = await resp.json();

    // KPIs
    const ymdNow = now.toISOString().slice(0, 10);
    const t7 = new Date(now.getTime() - 7 * 864e5);

    let total_hoje = 0;
    let total_7d = 0;
    let sem_utm = 0;
    let com_utm = 0;

    for (const r of rows) {
      const ymd = String(r.created_at || '').slice(0, 10);
      if (ymd === ymdNow) total_hoje++;
      if (new Date(r.created_at) >= t7) total_7d++;
      if (r.utm_source) com_utm++;
      else sem_utm++;
    }

    // agregações
    const por_utm_source = countBy(rows, (r) => r.utm_source);
    const por_utm_campaign = countBy(rows, (r) => r.utm_campaign);
    const por_utm_medium = countBy(rows, (r) => r.utm_medium);
    const por_device = countBy(rows, (r) => r.device_type);

    // por dia (YYYY-MM-DD)
    const porDiaMap = new Map();
    for (const r of rows) {
      const dia = String(r.created_at || '').slice(0, 10);
      if (!dia) continue;
      porDiaMap.set(dia, (porDiaMap.get(dia) || 0) + 1);
    }
    const por_dia = [...porDiaMap.entries()]
      .map(([dia, count]) => ({ dia, count }))
      .sort((a, b) => a.dia.localeCompare(b.dia));

    return res.status(200).json({
      ok: true,
      total_periodo: rows.length,
      total_hoje,
      total_7d,
      sem_utm,
      com_utm,
      por_utm_source: por_utm_source.slice(0, 20),
      por_utm_campaign: por_utm_campaign.slice(0, 20),
      por_utm_medium: por_utm_medium.slice(0, 20),
      por_device,
      por_dia,
      from,
      to,
    });
  } catch (err) {
    console.error('[leads-summary] falha', err.message);
    return res.status(500).json({ ok: false, error: 'fetch_error' });
  }
};
