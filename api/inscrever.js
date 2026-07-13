/**
 * POST /api/inscrever
 *
 * Recebe { nome, whatsapp, origem } do formulário de captura e grava
 * na tabela `leads_live_carla` no Supabase (projeto fugjtbpjanvelgaeqbqz).
 *
 * Sempre responde 200 (sucesso ou fallback silencioso) pra não travar
 * a UX do lead — quem digitou os dados vai pra /obrigado independente
 * de erro em back-end. Erros ficam nos logs Vercel pra investigar depois.
 *
 * Env vars necessárias (Vercel → Settings → Environment Variables):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  (NUNCA expor no front)
 *
 * Tabela esperada:
 *   create table leads_live_carla (
 *     id           uuid primary key default gen_random_uuid(),
 *     nome         text not null,
 *     whatsapp     text not null,
 *     origem       text,
 *     ip           text,
 *     user_agent   text,
 *     referer      text,
 *     created_at   timestamptz not null default now()
 *   );
 *   create index on leads_live_carla (created_at desc);
 *   create index on leads_live_carla (whatsapp);
 */
module.exports = async (req, res) => {
  // CORS básico (o site chama do mesmo domínio, mas facilita testes)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

  // Extrai body (Vercel já parseia JSON automaticamente se o header for correto)
  const body = req.body || {};
  const nome = String(body.nome || '').trim().slice(0, 120);
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '').slice(0, 15);
  const origem = String(body.origem || 'live').trim().slice(0, 60);

  if (!nome || whatsapp.length < 10) {
    return res.status(400).json({ ok: false, error: 'nome e whatsapp obrigatórios' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('[inscrever] env vars ausentes', {
      hasUrl: !!SUPABASE_URL,
      hasKey: !!SERVICE_ROLE,
    });
    // ainda responde 200 pro lead seguir pra /obrigado
    return res.status(200).json({ ok: false, saved: false, reason: 'env_missing' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress || null;
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
  const referer = String(req.headers['referer'] || '').slice(0, 500);

  const payload = {
    nome,
    whatsapp,
    origem,
    ip,
    user_agent: userAgent,
    referer,
  };

  try {
    const url = `${SUPABASE_URL}/rest/v1/leads_live_carla`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[inscrever] supabase respondeu', resp.status, text.slice(0, 500));
      return res.status(200).json({ ok: false, saved: false, status: resp.status });
    }

    const data = await resp.json().catch(() => null);
    return res.status(200).json({ ok: true, saved: true, id: data?.[0]?.id || null });
  } catch (err) {
    console.error('[inscrever] falha rede/parse', err);
    return res.status(200).json({ ok: false, saved: false, reason: 'fetch_error' });
  }
};
