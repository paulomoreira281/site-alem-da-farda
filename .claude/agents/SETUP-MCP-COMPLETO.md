# Setup MCP completo — Supabase + Meta Ads

## ✅ O que já está feito

Arquivo `claude_desktop_config.json` criado em `%APPDATA%\Claude\` com:

- **MCP Supabase** — funcionando 100%. PAT `sbp_e6dfd9...` já embutido.
- **MCP Meta Ads** — instalado, só falta você colar o token do Meta.

## 🎯 O que falta você fazer

### Passo 1: Gerar o Meta Access Token (~5 min)

Existem 2 caminhos. Recomendo o **rápido primeiro** pra testar, depois migra pro permanente.

#### Caminho A — Token rápido (~2h de validade, ideal pra testar)

1. Abre https://developers.facebook.com/tools/explorer/
2. Faz login com a conta que gerencia os anúncios
3. No topo, seleciona:
   - **Meta App:** qualquer app (se não tiver, cria um "Business" em https://developers.facebook.com/apps)
   - **User or Page:** você
4. Clica em **Add a Permission** e adiciona:
   - `ads_read` (obrigatório — só leitura de campanhas)
   - `business_management`
   - `read_insights`
5. Clica em **Generate Access Token**
6. Copia o token gerado (começa com `EAAB...`)

#### Caminho B — Token permanente (System User, nunca expira)

Se depois do teste você quiser deixar rodando pra sempre:

1. Vai em https://business.facebook.com/settings/system-users
2. **Add** → nome tipo "Claude MCP" → role `Employee`
3. Selecionar o System User → **Add Assets** → **Ad Accounts** → escolhe a conta `2539577898324530XX` (a Escrivã)
   - Permissions: `View performance` (só leitura)
4. **Generate New Token** → escolher app → permissões `ads_read`, `business_management`, `read_insights` → escolher "Never" pra expiração
5. Copia o token

---

### Passo 2: Colar o token no config

Abre o arquivo `%APPDATA%\Claude\claude_desktop_config.json` no editor. Deve estar assim:

```json
{
  "mcpServers": {
    "supabase-carla": { ... já configurado ... },
    "meta-ads": {
      "command": "npx",
      "args": ["-y", "@getscaleforge/mcp-meta-ads"],
      "env": {
        "META_ACCESS_TOKEN": "COLE_SEU_TOKEN_META_AQUI"
      }
    }
  }
}
```

Substitui `COLE_SEU_TOKEN_META_AQUI` pelo token que você copiou. Salva.

---

### Passo 3: Reiniciar Claude Desktop

Fecha COMPLETAMENTE o Claude Desktop (não só minimiza — fecha pelo menu ou clique-direito no ícone da bandeja → Quit).

Reabre.

No canto inferior direito do input tem um ícone de **🔨 (martelo)**. Clica nele.

Deve aparecer 2 servidores conectados:
- `supabase-carla`
- `meta-ads`

Se aparecer só o Supabase = token do Meta tá com problema (expirou, sem permissão, colado errado).
Se não aparecer nenhum = tem erro no JSON. Valida em https://jsonlint.com

---

## ✅ Como testar

Numa conversa nova no Claude Desktop:

### Testar Supabase MCP

> Quantos leads a Carla teve hoje na tabela `leads_live_carla`?

Ele deve executar SQL direto e responder. Ou:

> Me mostra os 10 últimos leads com utm_source preenchido.

### Testar Meta Ads MCP

> Lista minhas contas de anúncios da Meta

Deve mostrar a `Escrivã conta 1 (2539577898324530...)`.

> Qual o CPL do conjunto `CAR-CAP-IMER-QUENTE-TESTECRI` nos últimos 7 dias?

Ele consulta o Meta e retorna.

### Cruzamento (o valor de verdade)

Com os 2 MCPs, você pode fazer perguntas cruzadas de um só lado:

> Compara o CPL que o Meta reporta pro conjunto `4-2-DIN-CAR-CAP-IMER-QUENTE-TESTECRI` com quantos leads realmente entraram na tabela `leads_live_carla` com esse utm_medium nos últimos 7 dias. Me diz a diferença de CPL.

Ele consulta Meta → consulta Supabase → calcula → responde.

---

## 🔒 Segurança

Seu `claude_desktop_config.json` tem **3 tokens sensíveis**:
1. `SUPABASE_ACCESS_TOKEN` (`sbp_...`) — acesso total aos seus projetos Supabase
2. `META_ACCESS_TOKEN` (`EAAB...`) — acesso aos anúncios Meta
3. `ADMIN_TOKEN` (no site) — não tá no config, mas você usa pra logar em `alemdafarda.com.br/admin-leads`

**Boas práticas:**
- Nunca commita esse arquivo em Git
- Se compartilhar o computador, considera criptografia de disco
- Se algum token vazar: gera outro no dashboard, substitui no config, revoga o antigo

---

## 🛠 Se der problema

### "supabase-carla não aparece no menu do martelo"

Roda no PowerShell pra ver o log:

```powershell
type "$env:APPDATA\Claude\logs\mcp*.log"
```

Se der `SUPABASE_ACCESS_TOKEN inválido` → o PAT expirou. Gera outro em https://supabase.com/dashboard/account/tokens

### "meta-ads não aparece"

Provavelmente o token do Meta expirou (o rápido dura 2h) ou faltou permissão `ads_read`. Gera outro pelo Graph API Explorer.

### "JSON malformado"

Cola o conteúdo do arquivo em https://jsonlint.com. Ele aponta qual linha tá com erro.

---

## 📱 Alternativa mobile

O Claude Desktop **não roda** no celular. Se quiser acompanhar mobile:

- **Bookmark:** https://www.alemdafarda.com.br/admin-leads
- **Login:** `4tmJ1+BtpsSV5YneDFiaHq7HluOSXMDGXTMXLMw3Gk0=`

O admin já é 100% mobile-responsive e tem filtros por UTM, source, campaign.

---

## 📚 Referências

- Supabase MCP: https://github.com/supabase/mcp
- Meta Ads MCP (ScaleForge): https://getscaleforge.com/install-mcp
- Graph API Explorer: https://developers.facebook.com/tools/explorer/
- Business Manager: https://business.facebook.com/settings/system-users
