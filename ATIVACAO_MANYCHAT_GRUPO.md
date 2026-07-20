# Ativação — ManyChat + Grupo WhatsApp + Admin claro

Commit `7a78f1f` já foi pra `main`. Vercel está deployando automaticamente.

Faltam **2 passos** pra tudo funcionar:

---

## PASSO 1 — Rodar migration no Supabase

Abrir: https://supabase.com/dashboard/project/fugjtbpjanvelgaeqbqz/sql/new

Colar e clicar em **Run**:

```sql
-- Novas colunas em leads_live_carla pra rastrear ManyChat
alter table leads_live_carla
  add column if not exists primeiro_nome text,
  add column if not exists manychat_subscriber_id text,
  add column if not exists manychat_status text;

create index if not exists idx_leads_manychat_status on leads_live_carla (manychat_status);

-- Nova tabela pra snapshots do grupo WhatsApp
create table if not exists grupo_snapshots (
  id uuid primary key default gen_random_uuid(),
  grupo_url text not null,
  grupo_nome text,
  grupo_id text,
  membros_total int not null,
  membros_equipe int default 0,
  membros_ajustado int generated always as (membros_total - coalesce(membros_equipe, 0)) stored,
  participants_raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_grupo_snapshots_created on grupo_snapshots (created_at desc);

alter table grupo_snapshots enable row level security;
```

---

## PASSO 2 — Adicionar 7 env vars no Vercel

Abrir: https://vercel.com/paulo-moreiras-projects-824711c0/alem-da-farda/settings/environment-variables

Adicionar cada uma (marcar as 3 caixinhas: Production, Preview, Development):

| # | Key | Value |
|---|---|---|
| 1 | `MANYCHAT_TOKEN` | `5001788:e7e81c20d2ce46d12b783d1427019f0f` |
| 2 | `MANYCHAT_FLOW_ID` | `content20260716144358_929716` |
| 3 | `ZAPI_INSTANCE_ID` | `3CFC7412BF6B609E2D0046D85C1A9F0C` |
| 4 | `ZAPI_TOKEN` | `EC6373D23FE01490ED3F0654` |
| 5 | `ZAPI_CLIENT_TOKEN` | `F052c0a399ef04541a3af21bb1b33c244S` |
| 6 | `GRUPO_URL` | `https://chat.whatsapp.com/BAkGIrBtRSmAz8FipMlKmx` |
| 7 | `GRUPO_EQUIPE_COUNT` | `7` |

Depois de salvar todas: **Deployments → menu ⋯ do último deploy → Redeploy**.

---

## Teste end-to-end

Depois do redeploy:

### 1. Testar fluxo de cadastro completo

Abrir aba anônima:
```
https://www.alemdafarda.com.br/?utm_source=teste&utm_campaign=e2e-manychat
```

Preencher com nome **de verdade** e WhatsApp **de verdade** (que possa receber a mensagem).

Verificar em ~10 segundos:
- ✅ Redirecionou pra `/obrigado`
- ✅ WhatsApp recebeu mensagem do bot (o flow `content20260716144358_929716`)
- ✅ No admin, o lead aparece com badge verde "✓ enviado" na coluna ManyChat

### 2. Testar admin com fundo claro

Abrir: https://www.alemdafarda.com.br/admin-leads

Logar com o token (`4tmJ1+BtpsSV5YneDFiaHq7HluOSXMDGXTMXLMw3Gk0=`)

Verificar:
- ✅ Fundo claro (creme #f7f5f0)
- ✅ Card "Grupo WhatsApp" no topo
- ✅ Botão **Atualizar** funciona → mostra "65 membros (58 líquidos)"
- ✅ Input de "Equipe" configurável (default 7)
- ✅ Nova coluna "ManyChat" na tabela com badges
- ✅ Botão de retry (↻) aparece só em leads que falharam

### 3. Testar reenvio manual

No admin, achar um lead com status `failed_*` (se houver). Clicar no botão ↻. Deve reenviar e atualizar o status.

---

## Como funciona por dentro

### Fluxo do cadastro (server-side)

Quando o lead preenche o form:

```
Front (index.html)
  ↓ POST /api/inscrever com nome + whatsapp + UTMs
Back (api/inscrever.js)
  ↓ Promise.allSettled em paralelo:
    ├─ Supabase INSERT (leads_live_carla)
    ├─ Make webhook (Google Sheets)
    └─ ManyChat (create subscriber + sendFlow) ← NOVO
  ↓ PATCH lead com os 3 status
  ↓ Response 200 pro front
Front
  ↓ redirect /obrigado
```

O ManyChat roda **em paralelo** com Supabase e Make, sem travar a resposta ao lead. Timeout de 5s. Se falhar, o lead ainda vai pra `/obrigado` normalmente e você pode reenviar depois pelo admin.

### Normalização do WhatsApp

O helper `normalizeBrPhone` corrige automaticamente:
- `61999998888` → `+5561999998888`
- `+55 61 99999-8888` → `+5561999998888`
- `(61) 8180-6211` (sem 9) → `+5561981806211` (adiciona 9)

### Extração do primeiro nome

`extractPrimeiroNome`:
- `"Maria da Silva"` → `Maria`
- `"joão pedro"` → `João` (capitaliza)
- `"CARLA"` → `Carla`

### Grupo WhatsApp

Quando você clica em **Atualizar**:
1. Backend chama Z-API: `GET group-invitation-metadata?url=...`
2. Salva snapshot em `grupo_snapshots` com participants_raw jsonb
3. Retorna: `{membros_total, membros_ajustado, ultimo_refresh}`

Fica registrado histórico de contagem por horário. Se quiser gráfico depois, é só ler da tabela.

---

## Status esperados do ManyChat

| Status | O que significa | Badge |
|---|---|---|
| `sent` | Subscriber criado + flow disparado | 🟢 verde ✓ enviado |
| `sent_existing` | Subscriber já existia, achamos por nome + flow disparado | 🔵 azul ✓ existente |
| `failed_create` | Não conseguiu criar nem achar o subscriber | 🔴 vermelho ✗ falhou |
| `failed_send` | Criou/achou mas o sendFlow falhou | 🔴 vermelho ✗ falhou |
| `failed_no_flow_id` | Env `MANYCHAT_FLOW_ID` ausente | 🔴 vermelho ✗ falhou |
| `skipped_no_phone` | WhatsApp inválido | ⚪ cinza sem tel |
| `failed_promise` | Timeout ou erro de rede | 🔴 vermelho ✗ falhou |

Todos os `failed_*` podem ser retentados manualmente pelo botão ↻ no admin.
