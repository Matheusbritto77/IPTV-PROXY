# System Design

## Objetivo

Expor um host público próprio para apps `SMARTER` e fluxos `XCIPTV/STB`, mantendo o upstream como detalhe interno.

## Componentes

### Edge

- `Nginx` ou `Caddy`
- TLS
- rate limiting por IP
- repasse para `Bun API`

### Public API

- compatibilidade `Xtream-like`
- endpoints públicos para `player_api`, `playlist`, `xmltv` e `stream`
- listagens de categorias live, vod e séries
- listagens de streams e `series_info`
- facade `portal.php` para STB/XCIPTV legacy
- autenticação local por usuário/senha

### Admin API

- criação de upstreams
- CRUD de usuários
- renovação, bloqueio, ativação e remoção
- emissão do payload comercial ao cliente
- painel web leve para operação diária
- painel já executa criação e ações básicas sem frontend separado
- painel já consegue alterar status de upstream
- painel já mostra métricas correntes e histórico simples

### Policies

- valida status
- valida vencimento
- valida IP permitido
- valida conexões simultâneas

### Proxy / Gateway

- consulta upstream em tempo real
- normaliza payloads
- reescreve URLs
- decide `redirect` ou `full proxy`
- repassa headers para range/seek em vídeo
- tenta upstream ativo e marca degradado quando health check falha

### Session Cache

- `Redis` mantém sessões quentes temporárias
- deduplicação por `user + device/ip + stream`
- contagem de conexões em tempo real sem consultar SQL a cada request

### Request Guard

- rate limit por IP
- bloqueio temporário por IP ou dispositivo
- heartbeat renovado a cada autenticação válida
- métricas simples expostas no health detalhado

### Persistence

- `PostgreSQL` para usuários, upstreams, sessões e auditoria
- `Redis` para sessão quente, rate limits e contadores rápidos

## Fluxo público

1. O app chama `GET /player_api.php` no seu host.
2. O controller extrai `username/password`.
3. O `AuthService` valida o cliente local.
4. O `AccessPolicy` aplica expiração/IP/conexão.
5. O `UpstreamGatewayService` consulta o upstream interno.
6. O builder devolve resposta no padrão público do seu servidor.

## Fluxo portal legacy

1. O dispositivo chama `GET /portal.php?action=handshake`.
2. Depois autentica em ações como `get_profile` e `get_all_channels`.
3. O backend valida o usuário local e responde no formato de portal.
4. `create_link` devolve um link do seu próprio host, não do upstream.
5. O fluxo também suporta `get_categories`, `get_ordered_list` e `get_series_info`.
6. O fluxo agora suporta `get_vod_info` e paginação básica em listas.
7. `get_short_epg` e `get_epg_info` já usam XMLTV do upstream quando disponível.

## Fluxo admin

1. Painel chama `POST /admin/upstreams`.
2. Painel chama `POST /admin/users`.
3. O backend salva credenciais locais e vínculo com upstream.
4. A resposta já volta com:
   - login local
   - senha local
   - `SMARTER`
   - `DNS XCIPTV`
   - vencimento

## Evolução sugerida

- enriquecer o parser XMLTV para formatos mais variados
- incluir failover com prioridades e pesos por upstream
- adicionar gráficos temporais mais ricos no painel web
