type DashboardInput = {
  appName: string;
  appBaseUrl: string;
  adminToken: string;
  defaultUpstreamId: string;
  defaultUpstreamUsername: string;
  defaultUpstreamPassword: string;
  metrics: Record<string, unknown>;
  history: Array<any>;
  users: Array<{
    id: string;
    clientName: string;
    username: string;
    status: string;
    expiresAt: string;
    maxConnections: number;
  }>;
  upstreams: Array<{
    id: string;
    name: string;
    smartersUrl: string;
    xciptvDns?: string | null;
    status: string;
    timeoutMs?: number;
    healthy?: Promise<boolean> | boolean;
  }>;
};

export function renderAdminDashboard(input: DashboardInput) {
  const maxHistory = Math.max(
    1,
    ...input.history.map((item: any) => Number(item?.redis?.activeSessionKeys || 0)),
  );
  const historyBars = input.history
    .slice()
    .reverse()
    .map((item: any) => {
      const value = Number(item?.redis?.activeSessionKeys || 0);
      const height = Math.max(8, Math.round((value / maxHistory) * 120));
      return `<div class="bar-wrap"><div class="bar" style="height:${height}px"></div><span>${value}</span></div>`;
    })
    .join("");

  const userRows = input.users
    .map(
      (user) => `
        <tr>
          <td>${user.clientName}</td>
          <td>${user.username}</td>
          <td>${user.status}</td>
          <td>${user.expiresAt}</td>
          <td>${user.maxConnections}</td>
          <td>
            <div class="actions">
              <button class="btn" onclick="renewUser('${user.id}')">Renovar</button>
              <button class="btn alt" onclick="suspendUser('${user.id}')">Suspender</button>
              <button class="btn ghost" onclick="activateUser('${user.id}')">Ativar</button>
              <button class="btn ghost" onclick="deleteUser('${user.id}')">Excluir</button>
            </div>
            <div class="code">${user.id}</div>
          </td>
        </tr>`,
    )
    .join("");

  const upstreamRows = input.upstreams
    .map(
      (upstream) => `
        <tr>
          <td>${upstream.name}</td>
          <td>${upstream.status} ${upstream.healthy ? "OK" : "DEGRADED"}</td>
          <td>${upstream.smartersUrl}<br /><span class="code">${upstream.xciptvDns || "-"}</span></td>
          <td>
            <div class="actions">
              <button class="btn" onclick="editUpstreamStatus('${upstream.id}', '${upstream.status}')">Status</button>
              <button class="btn ghost" onclick="editUpstream('${upstream.id}', '${upstream.name}', '${upstream.smartersUrl}', '${upstream.xciptvDns || ""}', '${upstream.timeoutMs || 8000}')">Editar</button>
            </div>
            <span class="code">${upstream.id}</span>
          </td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${input.appName} Admin</title>
  <style>
    :root {
      --bg: #f5efe4;
      --panel: #fffaf0;
      --ink: #1a2230;
      --muted: #5e6773;
      --accent: #0f766e;
      --accent-2: #c2410c;
      --line: #e7dcc7;
    }
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: radial-gradient(circle at top left, #fff6df, var(--bg)); color: var(--ink); }
    .wrap { max-width: 1240px; margin: 0 auto; padding: 32px 20px 48px; }
    .hero { display: grid; gap: 12px; margin-bottom: 28px; }
    .hero h1 { margin: 0; font-size: 40px; letter-spacing: 0.02em; }
    .hero p { margin: 0; color: var(--muted); max-width: 760px; }
    .grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; }
    .panel { background: rgba(255,250,240,0.92); border: 1px solid var(--line); border-radius: 20px; padding: 18px; box-shadow: 0 18px 40px rgba(52, 43, 21, 0.08); }
    .panel h2 { margin: 0 0 14px; font-size: 22px; }
    .meta { font-size: 13px; color: var(--muted); margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 10px 8px; vertical-align: top; }
    th { color: var(--accent-2); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .code { font-family: "SFMono-Regular", Menlo, monospace; font-size: 12px; }
    .stack { display: grid; gap: 10px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .metric { border: 1px solid var(--line); border-radius: 16px; padding: 14px; background: rgba(255,255,255,0.55); }
    .metric strong { display: block; font-size: 28px; }
    .chart { display: flex; align-items: end; gap: 8px; min-height: 150px; padding-top: 12px; }
    .bar-wrap { display: grid; justify-items: center; gap: 6px; }
    .bar { width: 22px; border-radius: 8px 8px 0 0; background: linear-gradient(180deg, var(--accent), var(--accent-2)); }
    .card { border: 1px solid var(--line); border-radius: 16px; padding: 14px; background: rgba(255,255,255,0.55); }
    .field { display: grid; gap: 6px; margin-bottom: 10px; }
    .field label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent-2); }
    .field input, .field select { width: 100%; box-sizing: border-box; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: #fff; }
    .btn { border: 0; border-radius: 999px; padding: 10px 14px; background: var(--accent); color: white; cursor: pointer; font-weight: 600; }
    .btn.alt { background: var(--accent-2); }
    .btn.ghost { background: #e7dcc7; color: var(--ink); }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #ddf4f1; color: #0f766e; font-size: 12px; }
    @media (max-width: 960px) { .grid { grid-template-columns: 1fr; } .hero h1 { font-size: 32px; } }
  </style>
  <script>
    async function submitJson(path, method, payload) {
      const response = await fetch(path, {
        method,
        headers: {
          "content-type": "application/json",
          "x-admin-token": ${JSON.stringify(input.adminToken)}
        },
        body: payload ? JSON.stringify(payload) : undefined
      });
      if (!response.ok) {
        const text = await response.text();
        alert("Falha: " + text);
        return;
      }
      window.location.reload();
    }
    async function createUser(event) {
      event.preventDefault();
      const form = new FormData(event.target);
      const fullName = form.get("fullName");
      await submitJson("/admin/users", "POST", {
        fullName: typeof fullName === "string" && fullName.trim() ? fullName.trim() : undefined,
        username: form.get("username"),
        password: form.get("password"),
        expiresAt: form.get("expiresAt"),
        maxConnections: Number(form.get("maxConnections")),
        upstreamId: ${JSON.stringify(input.defaultUpstreamId)},
        upstreamUsername: ${JSON.stringify(input.defaultUpstreamUsername)},
        upstreamPassword: ${JSON.stringify(input.defaultUpstreamPassword)}
      });
    }
    async function editUpstream(id, name, smartersUrl, xciptvDns, timeoutMs) {
      const nextName = prompt("Nome do upstream", name);
      if (!nextName) return;
      const nextSmartersUrl = prompt("SMARTER URL", smartersUrl);
      if (!nextSmartersUrl) return;
      const nextXciptvDns = prompt("XCIPTV DNS", xciptvDns);
      const nextTimeout = prompt("Timeout ms", timeoutMs);
      if (!nextTimeout) return;
      await submitJson("/admin/upstreams/" + id, "PATCH", {
        name: nextName,
        smartersUrl: nextSmartersUrl,
        xciptvDns: nextXciptvDns,
        timeoutMs: Number(nextTimeout)
      });
    }
    async function editUpstreamStatus(id, currentStatus) {
      const status = prompt("Novo status do upstream: ACTIVE, DEGRADED ou DISABLED", currentStatus);
      if (!status) return;
      await submitJson("/admin/upstreams/" + id, "PATCH", { status });
    }
    async function renewUser(id) {
      const expiresAt = prompt("Nova data ISO de vencimento", new Date().toISOString());
      if (!expiresAt) return;
      await submitJson("/admin/users/" + id + "/renew", "POST", { expiresAt });
    }
    async function suspendUser(id) { await submitJson("/admin/users/" + id + "/suspend", "POST"); }
    async function activateUser(id) { await submitJson("/admin/users/" + id + "/activate", "POST"); }
    async function deleteUser(id) { if (confirm("Remover usuario?")) await submitJson("/admin/users/" + id, "DELETE"); }
  </script>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <span class="badge">Gateway Control</span>
      <h1>${input.appName}</h1>
      <p>Painel operacional para criar usuários, renovar acessos, bloquear clientes e acompanhar upstreams do gateway.</p>
      <div class="meta">Host público: <span class="code">${input.appBaseUrl}</span></div>
      <div class="meta">Health detalhado: <span class="code">${input.appBaseUrl}/health/details</span></div>
    </section>
    <section class="grid">
      <article class="panel">
        <h2>Metricas</h2>
        <div class="metrics">
          <div class="metric"><span>Sessoes</span><strong>${String(input.metrics.activeSessionKeys || 0)}</strong></div>
          <div class="metric"><span>Heartbeats</span><strong>${String(input.metrics.heartbeats || 0)}</strong></div>
          <div class="metric"><span>Bloq. IP</span><strong>${String(input.metrics.blockedIps || 0)}</strong></div>
          <div class="metric"><span>Rate Buckets</span><strong>${String(input.metrics.rateBuckets || 0)}</strong></div>
        </div>
      </article>
      <article class="panel">
        <h2>Historico de Sessoes</h2>
        <div class="chart">${historyBars || '<div class="meta">Sem historico ainda.</div>'}</div>
      </article>
    </section>
    <section class="grid" style="margin-top: 20px;">
      <article class="panel">
        <h2>Usuarios</h2>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Login</th>
              <th>Status</th>
              <th>Vencimento</th>
              <th>Conexoes</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>${userRows || '<tr><td colspan="6">Nenhum usuario cadastrado.</td></tr>'}</tbody>
        </table>
      </article>
      <article class="panel">
        <h2>Upstreams</h2>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
              <th>URLs</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>${upstreamRows || '<tr><td colspan="4">Nenhum upstream cadastrado.</td></tr>'}</tbody>
        </table>
      </article>
    </section>
    <section class="grid" style="margin-top: 20px;">
      <article class="panel">
        <h2>Criar Usuario</h2>
        ${input.defaultUpstreamId ? "" : '<div class="meta">Configure BOOTSTRAP_UPSTREAM_SMARTERS_URL ou BOOTSTRAP_UPSTREAM_XCIPTV_DNS no .env para habilitar a criacao.</div>'}
        <form onsubmit="createUser(event)">
          <div class="field"><label>Login</label><input name="username" required /></div>
          <div class="field"><label>Senha</label><input name="password" required /></div>
          <div class="field"><label>Vencimento ISO</label><input name="expiresAt" value="${new Date(Date.now() + 86400000 * 30).toISOString()}" required /></div>
          <div class="field"><label>Max Conexoes</label><input name="maxConnections" type="number" value="0" required /></div>
          <button class="btn" type="submit" ${input.defaultUpstreamId ? "" : "disabled"}>Criar usuario</button>
        </form>
      </article>
    </section>
  </div>
</body>
</html>`;
}
