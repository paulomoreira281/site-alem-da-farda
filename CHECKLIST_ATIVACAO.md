# CHECKLIST DE ATIVAÇÃO — Rastreamento de leads

Tudo o que você precisa fazer, em ordem. Cada passo tem link direto e caminho de arquivo.

---

## 📌 CONTEXTO

Código já foi commitado no GitHub e o Vercel já deployou. Falta configurar:

1. **Banco de dados** (Supabase) — adicionar colunas novas
2. **Variáveis de ambiente** (Vercel) — configurar 4 vars
3. **Redeploy** — pra as vars entrarem em vigor
4. **Testar** — validar que tudo funciona

Tempo estimado: **10-15 minutos**.

---

## ✅ PASSO 1 — Migration SQL no Supabase

### 1.1 Abrir o SQL Editor

**Link direto:** https://supabase.com/dashboard/project/fugjtbpjanvelgaeqbqz/sql/new

(Se abrir na tela de login, entre na conta Supabase e depois cole o link de novo.)

### 1.2 Colar o SQL abaixo e clicar em **Run**

```sql
alter table leads_live_carla
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists utm_content    text,
  add column if not exists utm_term       text,
  add column if not exists fbclid         text,
  add column if not exists gclid          text,
  add column if not exists ttclid         text,
  add column if not exists msclkid        text,
  add column if not exists landing_url    text,
  add column if not exists referrer       text,
  add column if not exists device_type    text,
  add column if not exists browser        text,
  add column if not exists os             text,
  add column if not exists last_touch     jsonb,
  add column if not exists raw_utms       jsonb,
  add column if not exists webhook_status text;

create index if not exists idx_leads_utm_source          on leads_live_carla (utm_source);
create index if not exists idx_leads_utm_campaign        on leads_live_carla (utm_campaign);
create index if not exists idx_leads_created_at          on leads_live_carla (created_at desc);
create index if not exists idx_leads_utm_source_campaign on leads_live_carla (utm_source, utm_campaign);

alter table leads_live_carla enable row level security;
```

### 1.3 Validar

Cole no mesmo SQL Editor e clique Run:

```sql
select column_name from information_schema.columns
where table_name = 'leads_live_carla'
order by ordinal_position;
```

Deve listar as colunas novas: `utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, ttclid, msclkid, landing_url, referrer, device_type, browser, os, last_touch, raw_utms, webhook_status`.

---

## ✅ PASSO 2 — Env vars no Vercel

### 2.1 Abrir a página de env vars

**Link direto:** https://vercel.com/paulo-moreiras-projects-824711c0/alem-da-farda/settings/environment-variables

### 2.2 Verificar (talvez já existam)

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

Se **já existirem**, ótimo. Se **não existirem** (que foi o caso quando testei), pula pra seção 2.3.

### 2.3 Adicionar `SUPABASE_URL` (se faltar)

- **Key:** `SUPABASE_URL`
- **Value:** `https://fugjtbpjanvelgaeqbqz.supabase.co`
- **Environments:** marcar as 3 (Production, Preview, Development)
- Clicar em **Save**

### 2.4 Adicionar `SUPABASE_SERVICE_ROLE_KEY` (se faltar)

**Onde pegar o valor:**

**Link direto:** https://supabase.com/dashboard/project/fugjtbpjanvelgaeqbqz/settings/api

Nessa página, vai ter uma sessão "Project API keys". Copie a chave chamada `service_role` (secret) — **NÃO** a `anon` public.

**⚠️ Nunca cole essa chave em código ou compartilhe. Ela dá acesso total ao banco.**

- **Key:** `SUPABASE_SERVICE_ROLE_KEY`
- **Value:** cole a chave copiada acima
- **Environments:** marcar as 3
- Clicar em **Save**

### 2.5 Adicionar `ADMIN_TOKEN` (obrigatória — nova)

**Gerar o valor:** abra o Git Bash (ou terminal) e rode:

```bash
openssl rand -base64 32
```

Vai sair algo tipo `X9k7QP2mLnV3WjR8...`. Copie o resultado inteiro (sem espaço extra).

- **Key:** `ADMIN_TOKEN`
- **Value:** cola o resultado do openssl acima
- **Environments:** marcar as 3
- Clicar em **Save**

**⚠️ Anota esse token num lugar seguro (gerenciador de senhas / bloco de notas privado).** É a senha do admin de leads. Se perder, você gera outro e substitui no Vercel — token antigo para de valer.

### 2.6 Adicionar `MAKE_WEBHOOK_URL` (opcional)

Se você **não adicionar**, o código usa `https://hook.us1.make.com/hfk04fx9otssnvr46ltwp2uxrtrw9hp3` como fallback (hardcoded). Se **preferir controlar via env** (bom pra trocar depois sem redeploy de código):

- **Key:** `MAKE_WEBHOOK_URL`
- **Value:** `https://hook.us1.make.com/hfk04fx9otssnvr46ltwp2uxrtrw9hp3`
- **Environments:** marcar as 3
- Clicar em **Save**

---

## ✅ PASSO 3 — Redeploy

As env vars só entram em vigor num deploy novo. Duas formas:

### Opção A — Pelo dashboard Vercel

1. Abrir: https://vercel.com/paulo-moreiras-projects-824711c0/alem-da-farda/deployments
2. Achar o deploy mais recente (topo da lista)
3. Menu `⋯` do lado direito → **Redeploy**
4. Aguardar ~30s até status ficar `Ready`

### Opção B — Me pedir que eu faça

Eu faço um commit vazio pra disparar o deploy:

```bash
cd /c/tmp/site-alem-da-farda
git commit --allow-empty -m "chore: redeploy pra ativar env vars"
git push origin main
```

---

## ✅ PASSO 4 — Testes end-to-end

### 4.1 Testar cadastro com UTM

**URL de teste:**
```
https://www.alemdafarda.com.br/?utm_source=teste&utm_medium=cpc&utm_campaign=validacao&utm_content=anuncio1&utm_term=policia
```

1. Abra essa URL no navegador
2. Aperte **F12** → aba **Application** → **Cookies** → confira que existe `cm_ft`
3. Preencha o formulário com um nome e WhatsApp falsos (ex: `TESTE ADMIN` / `61999998888`)
4. Envie

### 4.2 Validar Supabase

**Link direto:** https://supabase.com/dashboard/project/fugjtbpjanvelgaeqbqz/editor

- Selecionar a tabela `leads_live_carla`
- Ver o lead novo no topo
- Confirmar que as colunas `utm_source`, `utm_medium`, `utm_campaign`, `landing_url`, `device_type`, `browser`, `os` estão preenchidas

### 4.3 Validar webhook Make

**Link direto:** https://www.make.com/en/hq/scenarios

- Abrir o cenário do webhook
- Ver execução nova (últimos minutos)
- Abrir o Google Sheets vinculado
- Confirmar linha nova com os 9 campos (created_at, nome, whatsapp, utm_*, referrer)

### 4.4 Testar first-touch (atribuição congelada)

1. Abra uma **aba anônima nova**
2. 1ª visita: `https://www.alemdafarda.com.br/?utm_source=facebook&utm_campaign=fb1`
3. Sem enviar o form, vá pra `https://www.alemdafarda.com.br/` (sem parâmetros)
4. Preencha e envie o form
5. No Supabase, veja o lead novo. `utm_source` deve ser `facebook` (não vazio) — porque o cookie congelou a origem original

### 4.5 Testar admin

**URL:** https://www.alemdafarda.com.br/admin-leads

1. Cole o `ADMIN_TOKEN` (o que você guardou no passo 2.5)
2. Clicar em **Entrar**
3. Deve mostrar os KPIs + tabela de leads
4. Testar cada botão:
   - Filtro por `utm_source=teste` (do passo 4.1)
   - Botão **Copiar** (WhatsApp vai pro clipboard)
   - Botão **Abrir** (abre aba do wa.me)
   - Botão **Detalhes** (expande JSON com toda info do lead)
   - Botão **Exportar CSV** (baixa arquivo com filtros aplicados)

### 4.6 Deletar leads de teste (opcional)

**Link direto:** https://supabase.com/dashboard/project/fugjtbpjanvelgaeqbqz/editor

- Filtrar por `nome ilike '%TESTE%'`
- Selecionar e deletar

---

## 📁 Mapa dos arquivos no repositório

Repositório: `paulomoreira281/site-alem-da-farda` (GitHub)
Vercel: projeto `alem-da-farda` → domínio `alemdafarda.com.br`
Repo local: `c:\tmp\site-alem-da-farda\`

### Arquivos EDITADOS

| Caminho | O que faz |
|---|---|
| [c:\tmp\site-alem-da-farda\index.html](c:\tmp\site-alem-da-farda\index.html) | Formulário + bloco JS de captura de UTMs + cookie `cm_ft` first-touch |
| [c:\tmp\site-alem-da-farda\api\inscrever.js](c:\tmp\site-alem-da-farda\api\inscrever.js) | Grava lead no Supabase (17 colunas) + dispara webhook Make paralelo |
| [c:\tmp\site-alem-da-farda\vercel.json](c:\tmp\site-alem-da-farda\vercel.json) | Cache + headers de segurança (`X-Robots-Tag: noindex` no admin) |

### Arquivos CRIADOS

| Caminho | O que faz |
|---|---|
| [c:\tmp\site-alem-da-farda\admin-leads.html](c:\tmp\site-alem-da-farda\admin-leads.html) | UI admin (login por token, filtros, tabela, KPIs, export CSV) |
| [c:\tmp\site-alem-da-farda\api\leads-list.js](c:\tmp\site-alem-da-farda\api\leads-list.js) | GET listagem de leads paginada com filtros |
| [c:\tmp\site-alem-da-farda\api\leads-summary.js](c:\tmp\site-alem-da-farda\api\leads-summary.js) | GET agregados/KPIs (por source, campaign, dia, device) |

### Documentação

| Caminho | O que faz |
|---|---|
| [c:\tmp\site-alem-da-farda\CHECKLIST_ATIVACAO.md](c:\tmp\site-alem-da-farda\CHECKLIST_ATIVACAO.md) | **Este arquivo** — checklist ordenado |
| [c:\tmp\site-alem-da-farda\INSTRUCOES_ATIVACAO.md](c:\tmp\site-alem-da-farda\INSTRUCOES_ATIVACAO.md) | Instruções detalhadas (redundante, pode apagar depois) |

### Plano original (referência)

| Caminho | O que faz |
|---|---|
| [C:\Users\Usuario\.claude\plans\agora-quero-que-salve-velvet-pond.md](C:\Users\Usuario\.claude\plans\agora-quero-que-salve-velvet-pond.md) | Plano completo aprovado — arquitetura, decisões, riscos |

---

## 🌐 URLs em produção

| Endpoint | Uso |
|---|---|
| `https://www.alemdafarda.com.br/` | Landing page (com captura de UTM) |
| `https://www.alemdafarda.com.br/obrigado` | Página pós-cadastro (redirect grupo WhatsApp) |
| `https://www.alemdafarda.com.br/admin-leads` | **Dashboard admin de leads** (bookmark isso) |
| `POST /api/inscrever` | Endpoint público (formulário chama) |
| `GET /api/leads-list?...` | Endpoint admin (exige `x-admin-token`) |
| `GET /api/leads-summary?...` | Endpoint admin (exige `x-admin-token`) |

---

## 🔧 Troubleshooting rápido

### "Token inválido" no admin
- Confirme que `ADMIN_TOKEN` foi salvo no Vercel (Environments Production + Preview + Development)
- Confirme que houve **redeploy** depois de salvar (Passo 3)
- Confira que não copiou espaço extra na cola

### Lead entra no Supabase mas UTMs vazios
- Acesse pela URL com parâmetros: `?utm_source=X&utm_campaign=Y`
- Se estiver em modo anônimo, o cookie `cm_ft` se apaga ao fechar a aba (isso é comportamento correto)
- Abra DevTools → Application → Cookies e confira que `cm_ft` foi setado

### Webhook Make não chegou
- Confira `webhook_status` na tabela `leads_live_carla`:
  - `sent` → tudo certo
  - `failed_timeout` → Make demorou >3s (normal em picos)
  - `failed_500` → cenário Make desligado / com erro
  - `null` → talvez env `MAKE_WEBHOOK_URL` esteja errada

### `env_missing` em `/api/inscrever`
- `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` faltando no Vercel
- Confira Passo 2.3 e 2.4

---

## 🎯 O que fazer AGORA

1. **Abrir SQL Editor** e rodar a migration (Passo 1)
2. **Abrir Vercel Env Vars** e configurar as 4 vars (Passo 2)
3. **Redeploy** (Passo 3)
4. **Testar cadastro** em produção (Passo 4)
5. Me avisar que testou → eu verifico end-to-end via curl e confirmo se tudo está funcionando

Se em qualquer passo travar, me chama que resolvo.
