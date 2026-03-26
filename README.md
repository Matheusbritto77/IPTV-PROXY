# P2P Gateway

Base de gateway em `Bun.js` para:

- autenticação local
- saída pública compatível com `Xtream-like`
- proxy interno para upstream
- gerenciamento de usuários e upstreams

## Edge com OpenResty

O projeto agora suporta uma arquitetura hibrida:

- `OpenResty` como edge publico
- `app` Bun para `player_api.php`, `get.php`, `xmltv.php`, painel e autorizacao
- `stream-relay` Bun para `live`, `movie` e `series`

Fluxo:

- cliente bate no `OpenResty`
- `OpenResty` chama `GET /internal/edge/authorize-stream` no `app`
- se autorizado, o `OpenResty` encaminha o stream para o `stream-relay`
- o `stream-relay` busca o upstream usando o cliente HTTP que ja funciona no projeto
- o cliente nunca fala direto com o upstream

## Setup

```bash
cp .env.example .env
docker compose up -d --build
```

Use uma `DATABASE_URL` sem `?schema=public` quando estiver rodando via `Bun.SQL`.

## Bootstrap Automatico

Se quiser subir com um upstream e um cliente inicial sem usar o front, preencha as variáveis `BOOTSTRAP_*` no `.env` e ative:

```env
BOOTSTRAP_ENABLED=true
```

Na subida do servidor, o projeto cria de forma idempotente:

- um upstream inicial
- um usuário inicial vinculado a esse upstream

Tambem gera automaticamente um cartao final em:

- `docs/generated/bootstrap-client-card.txt`

O upstream interno usa:

- `BOOTSTRAP_UPSTREAM_SMARTERS_URL`
- `BOOTSTRAP_UPSTREAM_XCIPTV_DNS`
- `BOOTSTRAP_UPSTREAM_USERNAME`
- `BOOTSTRAP_UPSTREAM_PASSWORD`

## Banco

O `docker-compose.yml` agora sobe um servico `migrate` que aplica a migration inicial automaticamente antes de `app` e `stream-relay`.

## Desenvolvimento Local

1. Copie o ambiente:

```bash
cp .env.example .env
```

2. Suba toda a stack:

```bash
docker compose up -d --build
```

3. Acesse o edge:

- `http://localhost:8090/healthz`
- `http://localhost:8090/player_api.php`
- `http://localhost:8090/admin/`

## Endpoints úteis

- `GET /health`
- `GET /health/details`
- `GET /admin/`
- `GET /player_api.php`
- `GET /portal.php`

## Compose para producao

Servicos principais no `docker-compose.yml`:

- `openresty`
- `app`
- `stream-relay`
- `postgres`
- `redis`

Porta publica:

- `OPENRESTY_PORT` por padrao `8090`

Para `Dockploy`, use [.env.dockploy.example](/Users/matheusbritto/tuf/p2p/.env.dockploy.example) como base. O fluxo esperado e:

1. copiar para `.env`
2. usar `APP_BASE_URL=https://renttool.store`
3. ajustar `ADMIN_TOKEN` e `EDGE_SHARED_SECRET`
4. preencher `BOOTSTRAP_UPSTREAM_*` se quiser upstream inicial
5. subir apenas o `openresty` como porta publica
6. manter `app`, `stream-relay`, `postgres` e `redis` internos

## Estrutura

Veja [docs/architecture.md](/Users/matheusbritto/tuf/p2p/docs/architecture.md).
