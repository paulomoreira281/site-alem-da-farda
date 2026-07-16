/**
 * GET /api/leads-list
 *
 * Lista leads da tabela `leads_live_carla` com filtros e paginação.
 * Endpoint admin — exige header x-admin-token bater com env ADMIN_TOKEN.
 *
 * Query params (todos opcionais):
 *   utm_source, utm_medium, utm_campaign, utm_content: filtro exato
 *   origem:                                            filtro exato
 *   from, to:                                          ISO date (created_at gte/lte)
 *   search:                                            busca em nome+whatsapp (ilike)
 *   sem_utm=1:                                         só leads sem utm_source
 *   page:                                              1-based, default 1
 *   limit:                                             default 50, max 200
 *
 * Response 200:
 *   { ok:true, leads:[...], total, page, limit, pages }
 * Response 401:
 *   { ok:false, error:'unauthorized' }
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

function esc(v) {
  return encodeURIComponent(String(v || ''));
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

  const page = Math.max(1, parseInt(q.get('page') || '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(q.get('limit') || '50', 10) || 50));
  const offset = (page - 1) * limit;

  // constrói querystring PostgREST
  const parts = [
    'select=*',
    `order=created_at.desc`,
    `limit=${limit}`,
    `offset=${offset}`,
  ];

  // filtros exatos
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'origem'].forEach((k) => {
    const v = q.get(k);
    if (v) parts.push(`${k}=eq.${esc(v)}`);
  });

  // datas
  const from = q.get('from');
  const to = q.get('to');
  if (from) parts.push(`created_at=gte.${esc(from)}`);
  if (to) parts.push(`created_at=lte.${esc(to)}`);

  // sem_utm=1 → utm_source is null
  if (q.get('sem_utm') === '1') {
    parts.push('utm_source=is.null');
  }

  // busca: or=(nome.ilike.*x*,whatsapp.ilike.*x*)
  const search = q.get('search');
  if (search) {
    const s = esc(`*${search}*`);
    parts.push(`or=(nome.ilike.${s},whatsapp.ilike.${s})`);
  }

  const supabaseUrl = `${SUPABASE_URL}/rest/v1/leads_live_carla?${parts.join('&')}`;

  try {
    const resp = await fetch(supabaseUrl, {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        Prefer: 'count=exact',
      },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[leads-list] supabase respondeu', resp.status, text.slice(0, 300));
      return res.status(500).json({ ok: false, error: 'supabase_error', status: resp.status });
    }

    // extrai total do header Content-Range: "0-49/342"
    const contentRange = resp.headers.get('content-range') || '';
    const total = parseInt(contentRange.split('/')[1] || '0', 10) || 0;
    const leads = await resp.json();

    return res.status(200).json({
      ok: true,
      leads,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error('[leads-list] falha', err.message);
    return res.status(500).json({ ok: false, error: 'fetch_error' });
  }
};
