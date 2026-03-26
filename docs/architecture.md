# Architecture

## Camadas

- `controllers`: endpoints públicos e admin
- `middlewares`: auth admin e tratamento de erro
- `middlewares/request-guard`: rate limit e bloqueio em Redis
- `services/public`: autenticação e respostas para apps
- `services/public/session-cache-service`: sessão quente e limite de conexão em Redis
- `services/admin`: gestão de usuários e upstreams
- `services/proxy`: cache, proxy e agregação de upstream
- `services/proxy/upstream-health-service`: health checks e escolha de upstream
- `repositories`: acesso ao Postgres via `Bun.sql`
- `policies`: regras de expiração, IP e limite de conexão
- `events`: trilha de auditoria
- `views`: formatação do payload/texto mostrado ao cliente final
- `adapters/upstream`: integração com fornecedor real

## Fluxo

`App cliente -> controller público -> auth service -> policy -> repository -> upstream gateway -> adapter upstream`

`Painel admin -> controller admin -> admin service -> repository -> response/view`

## Superfície pública

- `GET /health`
- `GET /health/details`
- `GET /player_api.php`
- `GET /panel_api.php`
- `GET /get.php`
- `GET /xmltv.php`
- `GET /portal.php`
- `GET /live/:username/:password/:streamId.:extension`
- `GET /movie/:username/:password/:streamId.:extension`
- `GET /series/:username/:password/:streamId.:extension`

Actions suportadas via query em `player_api.php`:

- `get_live_categories`
- `get_vod_categories`
- `get_series_categories`
- `get_live_streams`
- `get_vod_streams`
- `get_series`
- `get_series_info`

Actions base suportadas em `portal.php`:

- `handshake`
- `get_profile`
- `get_main_info`
- `get_genres`
- `get_all_channels`
- `create_link`
- `get_vod_info`
- `get_short_epg`
- `get_epg_info`
- `get_ordered_list` com paginação básica

## Superfície admin

- `GET /admin/users`
- `POST /admin/users`
- `GET /admin/`
- `GET /admin/users/:id`
- `PATCH /admin/users/:id`
- `POST /admin/users/:id/renew`
- `POST /admin/users/:id/suspend`
- `POST /admin/users/:id/activate`
- `DELETE /admin/users/:id`
- `GET /admin/upstreams`
- `POST /admin/upstreams`
- `PATCH /admin/upstreams/:id`

Header obrigatório:

- `x-admin-token`

## Delivery

- metadata e autenticação passam sempre pelo backend
- streams podem usar `302 redirect` ou `full proxy`
- `STREAM_MODE=proxy` faz pass-through do stream pelo seu servidor
- upstream fica encapsulado dentro dos adapters
- Redis mantém a sessão quente por fingerprint de dispositivo/IP/stream
- Redis também aplica rate limit e bloqueio de IP/dispositivo
- upstream pode cair para outro endpoint ativo quando o preferido degrada
- health detalhado expõe Redis, sessões, rate limits e estado dos upstreams
- painel web exibe métricas correntes e histórico simples de sessões
