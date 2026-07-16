/**
 * Helper ManyChat — cria subscriber pelo WhatsApp e dispara flow.
 *
 * Env vars:
 *   MANYCHAT_TOKEN    — token da conta ManyChat (formato "PAGE_ID:HASH")
 *   MANYCHAT_FLOW_ID  — content_id / flow_ns do flow a disparar
 *
 * Uso:
 *   const { createAndSendFlow, extractPrimeiroNome, normalizeBrPhone } = require('./_lib/manychat');
 *   const status = await createAndSendFlow({ nome, whatsapp });
 *   // status: 'sent' | 'sent_existing' | 'failed_no_flow_id' | 'failed_create' | 'failed_send'
 */

const API = 'https://api.manychat.com';

// Extrai primeiro nome — descarta partes vazias, capitaliza
function extractPrimeiroNome(fullName) {
  if (!fullName) return '';
  const nome = String(fullName).trim();
  if (!nome) return '';
  // pega antes do primeiro espaço
  const primeiro = nome.split(/\s+/)[0];
  // capitaliza: primeiro char upper, resto lower
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

// Normaliza WhatsApp brasileiro pra formato E.164 (+55 + DDD + 9 + número).
// Aceita entrada com/sem +55, com/sem 9 do celular, com/sem máscara.
// Retorna string com "+" no início, ou null se inválido.
function normalizeBrPhone(input) {
  if (!input) return null;
  // só dígitos
  const d = String(input).replace(/\D/g, '');
  if (!d) return null;

  let sem55 = d;
  if (d.startsWith('55') && d.length >= 12) {
    sem55 = d.slice(2);
  }

  // sem55 deve ter DDD (2) + celular (8 ou 9 dígitos)
  if (sem55.length < 10 || sem55.length > 11) return null;

  const ddd = sem55.slice(0, 2);
  let numero = sem55.slice(2);

  // Se o celular veio sem o 9 (8 dígitos), adiciona
  if (numero.length === 8) {
    numero = '9' + numero;
  }

  // Valida DDD (11 a 99)
  if (parseInt(ddd, 10) < 11 || parseInt(ddd, 10) > 99) return null;
  if (numero.length !== 9) return null;

  return '+55' + ddd + numero;
}

async function apiPost(path, body, timeoutMs = 5000) {
  const token = process.env.MANYCHAT_TOKEN;
  if (!token) throw new Error('MANYCHAT_TOKEN ausente');
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: r.status, ok: r.ok, json, raw: text };
  } catch (e) {
    clearTimeout(to);
    return { status: 0, ok: false, error: e.message || String(e) };
  }
}

async function apiGet(path, timeoutMs = 5000) {
  const token = process.env.MANYCHAT_TOKEN;
  if (!token) throw new Error('MANYCHAT_TOKEN ausente');
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { status: r.status, ok: r.ok, json, raw: text };
  } catch (e) {
    clearTimeout(to);
    return { status: 0, ok: false, error: e.message || String(e) };
  }
}

/**
 * Cria subscriber (ou reaproveita se já existe) e dispara o flow.
 * Retorna: { status, subscriber_id }
 *   status: 'sent' | 'sent_existing' | 'failed_no_flow_id' | 'failed_create' | 'failed_send' | 'skipped_no_phone'
 */
async function createAndSendFlow({ nome, whatsapp, extraFields }) {
  const flowId = process.env.MANYCHAT_FLOW_ID;
  if (!flowId) return { status: 'failed_no_flow_id', subscriber_id: null };

  const phone = normalizeBrPhone(whatsapp);
  if (!phone) return { status: 'skipped_no_phone', subscriber_id: null };

  const primeiroNome = extractPrimeiroNome(nome) || 'Amigo';

  const createBody = {
    first_name: primeiroNome,
    phone,
    whatsapp_phone: phone,
    has_opt_in_sms: true,
    consent_phrase: 'Autorizacao Imersao Policia Civil',
    ...(extraFields || {}),
  };

  // 1) tenta criar
  let createRes = await apiPost('/fb/subscriber/createSubscriber', createBody);

  let subscriberId = null;
  let alreadyExisted = false;

  if (createRes.ok && createRes.json?.status === 'success') {
    subscriberId = createRes.json?.data?.id;
  } else {
    // 2) falhou por já existir? procura fallback por nome
    const msgs = createRes.json?.details?.messages;
    const errStr = JSON.stringify(msgs || {});
    if (errStr.includes('already exists')) {
      alreadyExisted = true;
      // fallback: findByName. O findByName lista por primeiro nome, então filtra por whatsapp
      const findRes = await apiGet(`/fb/subscriber/findByName?name=${encodeURIComponent(primeiroNome)}`);
      const list = findRes.json?.data || [];
      const match = list.find((s) => (s.whatsapp_phone || '').replace(/\D/g, '') === phone.replace(/\D/g, ''));
      if (match) subscriberId = match.id;
    }
  }

  if (!subscriberId) {
    return { status: 'failed_create', subscriber_id: null };
  }

  // 3) dispara o flow
  const sendRes = await apiPost('/fb/sending/sendFlow', {
    subscriber_id: Number(subscriberId),
    flow_ns: flowId,
  });

  if (sendRes.ok && sendRes.json?.status === 'success') {
    return {
      status: alreadyExisted ? 'sent_existing' : 'sent',
      subscriber_id: String(subscriberId),
    };
  }

  return { status: 'failed_send', subscriber_id: String(subscriberId) };
}

module.exports = {
  createAndSendFlow,
  extractPrimeiroNome,
  normalizeBrPhone,
};
