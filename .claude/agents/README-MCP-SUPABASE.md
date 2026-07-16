# MCP Supabase — Como acompanhar leads em qualquer conversa Claude

## O que é MCP

MCP (Model Context Protocol) é o jeito da Anthropic conectar o Claude a **serviços externos** (Supabase, GitHub, Slack, etc). Depois de configurar 1 vez, o Claude Desktop consegue **consultar direto** o Supabase em qualquer conversa — sem precisar do agente `analise-leads-carla`.

Com o MCP Supabase, você fala coisas tipo:
> "Quantos leads da Carla a gente tem hoje?"
> "Qual criativo tá convertendo mais?"
> "Me mostra os últimos 10 leads com UTM"

E o Claude executa SQL direto no seu banco em segundos.

---

## Duas formas de configurar

### Opção 1: MCP Supabase oficial (recomendado)

**Requer:** Personal Access Token do Supabase (diferente da `service_role_key`).

#### Passo 1: Gerar Personal Access Token

1. Abre https://supabase.com/dashboard/account/tokens
2. Clica em **Generate new token**
3. Nome sugerido: `MCP Claude Desktop`
4. Copia o token gerado (começa com `sbp_...`) — **anota**, ele só aparece uma vez

#### Passo 2: Descobrir o Project Ref

Já sabemos: **`fugjtbpjanvelgaeqbqz`** (é o subdomínio do `.supabase.co`).

#### Passo 3: Instalar Claude Desktop se ainda não tem

Download: https://claude.ai/download

#### Passo 4: Configurar o MCP no Claude Desktop

Abre o arquivo de config do Claude Desktop:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
(pode colar no explorer: `%APPDATA%\Claude`)

**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Se o arquivo não existir, cria. Cola dentro:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--project-ref=fugjtbpjanvelgaeqbqz"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "COLA_SEU_TOKEN_sbp_AQUI"
      }
    }
  }
}
```

Substitui `COLA_SEU_TOKEN_sbp_AQUI` pelo token que você gerou no passo 1.

#### Passo 5: Reiniciar o Claude Desktop

Fecha e abre de novo. No canto inferior do input tem um ícone de ferramenta 🔧 — clica pra confirmar que "supabase" aparece na lista.

#### Passo 6: Testar

Numa conversa nova no Claude Desktop:
> "Quantos leads a tabela `leads_live_carla` tem hoje?"

Ele vai executar SQL direto e responder.

---

### Opção 2: MCP HTTP simples (via API do site)

Se você não quer configurar Personal Access Token do Supabase, pode usar a API admin do próprio site como MCP. Mais fácil pra configurar mas menos poderoso.

**Requer:** só o `ADMIN_TOKEN` que você já tem.

**Passos:**

1. Abre `%APPDATA%\Claude\claude_desktop_config.json`

2. Cola:

```json
{
  "mcpServers": {
    "leads-carla": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fetch"
      ],
      "env": {
        "FETCH_HEADERS": "{\"x-admin-token\":\"4tmJ1+BtpsSV5YneDFiaHq7HluOSXMDGXTMXLMw3Gk0=\"}"
      }
    }
  }
}
```

3. Reiniciar Claude Desktop.

4. Numa conversa:
> "Fetch https://www.alemdafarda.com.br/api/leads-summary e me mostra a contagem"

**Limitação:** só faz GET nas rotas que a API expõe (`/api/leads-list` e `/api/leads-summary`). Não roda SQL arbitrário.

---

## Alternativa: Claude Mobile / Web

Se você quer acompanhar do celular (Claude no navegador), tem 2 caminhos:

### A. Bookmark do dashboard admin

Adiciona nos favoritos do celular:
- **URL:** https://www.alemdafarda.com.br/admin-leads
- **Login:** cola o `ADMIN_TOKEN` (`4tmJ1+BtpsSV5YneDFiaHq7HluOSXMDGXTMXLMw3Gk0=`)

O dashboard já é 100% mobile-responsive. Serve pra ver contagem, filtrar por campanha, copiar WhatsApp.

### B. WebFetch dentro do Claude Web

Cola no chat:
> "Consulta https://www.alemdafarda.com.br/api/leads-summary com header x-admin-token=4tmJ1+BtpsSV5YneDFiaHq7HluOSXMDGXTMXLMw3Gk0= e me diz quantos leads temos"

O Claude Web (web.claude.ai) sabe fazer requests HTTP.

---

## Segurança

- **Personal Access Token do Supabase (`sbp_...`)**: dá acesso **total** a TODOS os projetos Supabase da sua conta. Guarda como se fosse senha.
- **service_role_key**: dá acesso total a UM projeto específico. Só usar em servidor (Vercel env vars).
- **ADMIN_TOKEN** (`4tmJ1+BtpsSV5YneDFiaHq7HluOSXMDGXTMXLMw3Gk0=`): só permite ler `/api/leads-*` do site. Menos poderoso, mas o suficiente pra consultar via HTTP fetch.

Se algum dos tokens vazar, o procedimento é:
1. Gera outro
2. Substitui no lugar que estava (Vercel env vars ou Claude Desktop config)
3. Revoga o antigo (no Supabase Dashboard → Account → Access Tokens)

---

## Referência rápida

| Recurso | Onde | Token |
|---|---|---|
| Dashboard admin web | alemdafarda.com.br/admin-leads | ADMIN_TOKEN |
| Claude Desktop com SQL | claude_desktop_config.json | sbp_... (Supabase PAT) |
| Claude Web fetch | web.claude.ai chat | ADMIN_TOKEN |
| curl na CLI | Bash | ADMIN_TOKEN |
| Supabase SQL Editor direto | supabase.com/dashboard | (login) |
