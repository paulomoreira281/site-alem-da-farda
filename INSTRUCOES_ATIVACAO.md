# INSTRUÇÕES DE ATIVAÇÃO — Rastreamento de leads + Admin

O código foi commitado e o Vercel já fez o deploy. **Falta 2 passos manuais seus** pra tudo funcionar:

---

## PASSO 1: Migration SQL no Supabase

1. Abra o dashboard do Supabase: https://supabase.com/dashboard
2. Selecione o projeto **`fugjtbpjanvelgaeqbqz`** (o do site alem-da-farda)
3. Vá em **SQL Editor** → **New query**
4. Cole o SQL abaixo e clique em **Run**:

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

5. Confira que rodou sem erro. Depois valide as colunas:

```sql
select column_name from information_schema.columns
where table_name = 'leads_live_carla'
order by ordinal_position;
```

Deve listar as novas colunas: `utm_source`, `utm_medium`, ..., `last_touch`, `raw_utms`, `webhook_status`.

---

## PASSO 2: Env vars no Vercel

**⚠️ IMPORTANTE:** Testei em produção e `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` **não estão configuradas** no projeto `alem-da-farda`. Precisam ser adicionadas pra qualquer coisa funcionar (inclusive o cadastro de leads que já existia).

1. Abra: https://vercel.com/paulo-moreiras-projects-824711c0/alem-da-farda/settings/environment-variables
2. Adicione **as 4 variáveis** (2 já esperadas + 2 novas):

### `SUPABASE_URL` (obrigatória — hoje falta)

Valor: URL do projeto Supabase. Formato: `https://fugjtbpjanvelgaeqbqz.supabase.co`

### `SUPABASE_SERVICE_ROLE_KEY` (obrigatória — hoje falta)

Valor: service_role key do Supabase. Encontra em: Dashboard Supabase → Settings → API → `service_role` (secret).

**⚠️ Nunca expor essa key no front. Ela dá acesso total ao banco.**

### `ADMIN_TOKEN` (obrigatória — usada pra logar no admin)

Gere um valor forte e único. Use o comando abaixo no terminal (Git Bash):

```bash
openssl rand -base64 32
```

Copie o resultado (algo tipo `X9k7QP...`) e cole como valor. Ambiente: **Production, Preview, Development** (todos).

**Guarde esse token** — é o que você vai usar pra logar em `alemdafarda.com.br/admin-leads`.

### `MAKE_WEBHOOK_URL` (opcional)

Se quiser trocar o webhook Make depois, adicione essa. Valor sugerido (o atual):

```
https://hook.us1.make.com/hfk04fx9otssnvr46ltwp2uxrtrw9hp3
```

Se você **não adicionar**, o código usa o valor hardcoded (o mesmo acima). Só adicione se quiser flexibilidade pra trocar depois.

3. Depois de salvar, **redeploy** o projeto pra as env vars entrarem em vigor:
   - Dashboard Vercel → aba **Deployments** → deploy mais recente → menu `...` → **Redeploy**
   - OU faça um commit vazio: `git commit --allow-empty -m "chore: pick up env vars" && git push`

---

## PASSO 3: Testar end-to-end

### 3.1 Testar formulário com UTM

1. Abra: `https://www.alemdafarda.com.br/?utm_source=teste&utm_medium=cpc&utm_campaign=validacao&utm_content=anuncio1&utm_term=policia`
2. Abra DevTools (F12) → aba **Application** → **Cookies** → confirme que existe `cm_ft`
3. Preencha o formulário com um nome e WhatsApp de teste
4. Envie
5. Vá no Supabase Dashboard → **Table Editor** → `leads_live_carla` → veja o registro novo com todas as UTMs preenchidas

### 3.2 Testar first-touch (atribuição congelada)

1. Aba anônima do navegador
2. Acesse: `https://www.alemdafarda.com.br/?utm_source=facebook&utm_campaign=fb1`
3. Sem enviar o form, navegue pra `https://www.alemdafarda.com.br/` (sem parâmetros)
4. Preencha e envie o form
5. No Supabase, o novo lead deve ter `utm_source=facebook` (não vazio) — porque o cookie first-touch congelou

### 3.3 Testar webhook Make

1. Após enviar um form, abra o cenário no Make: https://www.make.com/en/hq/scenarios
2. Veja se chegou uma execução nova
3. Verifique que o Google Sheets vinculado ao Make ganhou uma linha nova nas colunas A-I
4. No Supabase: `select webhook_status from leads_live_carla order by created_at desc limit 1;` → deve ser `sent`

### 3.4 Testar admin

1. Acesse: `https://www.alemdafarda.com.br/admin-leads`
2. Cole seu `ADMIN_TOKEN` no campo
3. Deve entrar direto no dashboard com os KPIs e a lista de leads
4. Teste os filtros, botão Copiar WhatsApp, botão Abrir, botão Detalhes, botão Exportar CSV

---

## Troubleshooting

**Admin diz "Token inválido"?**
- Confira que o env `ADMIN_TOKEN` foi salvo no Vercel
- Confira que o projeto foi redeployado depois de salvar o env
- Confira que você não copiou espaço extra na cola do token

**Lead entra no Supabase mas UTM vem vazio?**
- Você não usou parâmetro `?utm_source=X` na URL de acesso
- OU o browser está bloqueando cookies (modo anônimo pode zerar entre abas)
- Confira via DevTools → Application → Cookies se `cm_ft` foi setado

**Webhook Make não chegou?**
- Confira no Supabase se `webhook_status = 'sent'`
- Se `failed_timeout` → o Make demorou > 3s pra responder (normal em picos)
- Se `failed_500` → cenário do Make está desligado ou com erro
- Se `failed_promise` → erro de rede raro; consulta os logs do Vercel

**Precisa remover ou renomear webhook_status?**
- Ele é escrito via PATCH separado; se der problema temporário, o INSERT já tem `webhook_status: null` como default e o lead não é perdido

---

Depois de tudo funcionando, esse arquivo `INSTRUCOES_ATIVACAO.md` pode ser deletado (é só documentação de setup).
