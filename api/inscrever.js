/**
 * POST /api/inscrever
 *
 * Recebe { nome, whatsapp, origem, utm_*, fbclid, gclid, ... } do formulário
 * de captura, grava tudo na tabela `leads_live_carla` no Supabase (projeto
 * fugjtbpjanvelgaeqbqz) e dispara webhook pro Make em paralelo.
 *
 * Sempre responde 200 (sucesso ou fallback silencioso) pra não travar
 * a UX do lead — quem digitou os dados vai pra /obrigado independente
 * de erro em back-end. Erros ficam nos logs Vercel pra investigar depois.
 *
 * Env vars necessárias (Vercel → Settings → Environment Variables):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  (NUNCA expor no front)
 *   - MAKE_WEBHOOK_URL (opcional, tem fallback hardcoded)
 *
 * Ver migration em ../migrations (ou plano) — tabela precisa ter as colunas
 * utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid,
 * ttclid, msclkid, landing_url, referrer, device_type, browser, os, last_touch,
 * raw_utms, webhook_status.
 */

const { createAndSendFlow, extractPrimeiroNome } = require('./_lib/manychat');

const MAKE_WEBHOOK_DEFAULT = 'https://hook.us1.make.com/hfk04fx9otssnvr46ltwp2uxrtrw9hp3';

// utilitários
const s = (v, max = 200) => {
  if (v === null || v === undefined) return null;
  const str = String(v).trim();
  return str ? str.slice(0, max) : null;
};

function parseUA(ua) {
  const s = (ua || '').toLowerCase();
  const device_type = /iphone|android.*mobile|windows phone|iemobile|blackberry/.test(s) ? 'mobile'
                    : /ipad|tablet|kindle|playbook/.test(s) ? 'tablet'
                    : 'desktop';
  const browser = /edg\//.test(s) ? 'edge'
                : /opr\/|opera/.test(s) ? 'opera'
                : /chrome/.test(s) ? 'chrome'
                : /firefox/.test(s) ? 'firefox'
                : /safari/.test(s) ? 'safari'
                : 'other';
  const os = /windows/.test(s) ? 'windows'
           : /android/.test(s) ? 'android'
           : /iphone|ipad|ios/.test(s) ? 'ios'
           : /mac os/.test(s) ? 'macos'
           : /linux/.test(s) ? 'linux'
           : 'other';
  return { device_type, browser, os };
}

async function postMake(payload) {
  const MAKE_URL = process.env.MAKE_WEBHOOK_URL || MAKE_WEBHOOK_DEFAULT;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(MAKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    return r.ok ? 'sent' : `failed_${r.status}`;
  } catch (e) {
    clearTimeout(to);
    return `failed_${e.name === 'AbortError' ? 'timeout' : 'err'}`;
  }
}

async function postSupabase(payload) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    throw new Error(`supabase_${resp.status}: ${text.slice(0, 300)}`);
  }
  const data = await resp.json().catch(() => null);
  return data?.[0]?.id || null;
}

async function patchLead(id, patch) {
  if (!id || !patch || !Object.keys(patch).length) return;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/leads_live_carla?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
  } catch (e) {
    console.warn('[inscrever] patchLead falhou', e.message);
  }
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

  const body = req.body || {};
  const nome = String(body.nome || '').trim().slice(0, 120);
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '').slice(0, 15);
  const origem = String(body.origem || 'live').trim().slice(0, 60);
  // Split A/B: aceita apenas 'A' ou 'B'; qualquer outra coisa vira null
  const varianteRaw = String(body.variante || '').trim().toUpperCase();
  const variante = varianteRaw === 'A' || varianteRaw === 'B' ? varianteRaw : null;

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
    return res.status(200).json({ ok: false, saved: false, reason: 'env_missing' });
  }

  // metadados server-side
  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress || null;
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
  const referer = String(req.headers['referer'] || '').slice(0, 500);
  const { device_type, browser, os } = parseUA(userAgent);

  // last_touch (jsonb) vem do front (snapshot da URL do submit)
  let last_touch = null;
  if (body.last_touch && typeof body.last_touch === 'object') {
    try {
      const j = JSON.stringify(body.last_touch);
      last_touch = JSON.parse(j.slice(0, 4000));
    } catch (_) {}
  }

  // raw_utms (jsonb) — auditoria completa
  let raw_utms = null;
  if (body.raw_utms && typeof body.raw_utms === 'object') {
    try {
      const j = JSON.stringify(body.raw_utms);
      raw_utms = JSON.parse(j.slice(0, 4000));
    } catch (_) {}
  }

  // Split A/B: guarda a variante dentro de raw_utms.variante enquanto a
  // coluna dedicada não é criada no banco. Depois basta filtrar por
  // raw_utms->>'variante' = 'A' ou 'B' pra medir CVR.
  if (variante) {
    if (!raw_utms || typeof raw_utms !== 'object') raw_utms = {};
    raw_utms.variante = variante;
  }

  const primeiro_nome = extractPrimeiroNome(nome);

  // payload pro Supabase (tudo que couber)
  const supabasePayload = {
    nome,
    primeiro_nome,
    whatsapp,
    origem,
    ip,
    user_agent: userAgent,
    referer,
    utm_source:   s(body.utm_source),
    utm_medium:   s(body.utm_medium),
    utm_campaign: s(body.utm_campaign),
    utm_content:  s(body.utm_content),
    utm_term:     s(body.utm_term),
    fbclid:       s(body.fbclid),
    gclid:        s(body.gclid),
    ttclid:       s(body.ttclid),
    msclkid:      s(body.msclkid),
    landing_url:  s(body.landing_url, 500),
    referrer:     s(body.referrer, 500),
    device_type,
    browser,
    os,
    last_touch,
    raw_utms,
    webhook_status: null,
    manychat_status: null,
    manychat_subscriber_id: null,
  };

  // payload MÍNIMO pro Make → Google Sheets (9 campos, string vazia em vez de null)
  const makePayload = {
    created_at:   new Date().toISOString(),
    nome,
    whatsapp,
    utm_source:   supabasePayload.utm_source   || '',
    utm_medium:   supabasePayload.utm_medium   || '',
    utm_campaign: supabasePayload.utm_campaign || '',
    utm_content:  supabasePayload.utm_content  || '',
    utm_term:     supabasePayload.utm_term     || '',
    referrer:     supabasePayload.referrer     || '',
  };

  // ============================================================
  // ESTRATÉGIA DE VELOCIDADE:
  //   Roda os 3 em paralelo (allSettled), com timeouts curtos:
  //     - Supabase: essencial, precisa completar
  //     - Make:     3s timeout
  //     - ManyChat: 2,5s timeout por chamada (create + send em sequência),
  //                 total efetivo ~2-3s
  //   Response total esperado: 1,0-1,5s (limitado pela chamada mais lenta)
  //
  //   Note: usar waitUntil não é confiavel no Vercel Node runtime,
  //   então rodamos tudo dentro da handler mesmo.
  // ============================================================

  const [supResult, makeResult, mcResult] = await Promise.allSettled([
    postSupabase(supabasePayload),
    postMake(makePayload),
    createAndSendFlow({ nome, whatsapp }),
  ]);

  const id = supResult.status === 'fulfilled' ? supResult.value : null;
  const webhookStatus = makeResult.status === 'fulfilled' ? makeResult.value : 'failed_promise';
  const manychat = mcResult.status === 'fulfilled' ? mcResult.value : { status: 'failed_promise', subscriber_id: null };

  if (supResult.status === 'rejected') {
    console.error('[inscrever] supabase falhou', supResult.reason?.message);
  }
  if (makeResult.status === 'rejected') {
    console.error('[inscrever] make falhou', makeResult.reason?.message);
  }
  if (mcResult.status === 'rejected') {
    console.error('[inscrever] manychat falhou', mcResult.reason?.message);
  }

  // patch de status no Supabase (fire-and-forget agora, resposta já vai sair)
  if (id) {
    patchLead(id, {
      webhook_status: webhookStatus,
      manychat_status: manychat.status,
      manychat_subscriber_id: manychat.subscriber_id,
    });
  }

  return res.status(200).json({
    ok: true,
    saved: !!id,
    id,
    webhook: webhookStatus,
    manychat: manychat.status,
  });
};
