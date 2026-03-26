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
    upstreamId?: string;
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
  const userRows = input.users
    .map(
      (user) => `
        <tr data-user-id="${user.id}">
          <td>
            <div class="user-info">
              <span class="user-name">${user.clientName || "N/A"}</span>
              <span class="user-sub">${user.username}</span>
            </div>
          </td>
          <td><span class="badge ${user.status.toLowerCase()}">${user.status}</span></td>
          <td>${user.expiresAt}</td>
          <td>${user.maxConnections}</td>
          <td>
            <div class="actions">
              <button class="icon-btn" onclick="renewUser('${user.id}')" title="Renovar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
              </button>
              <button class="icon-btn" onclick="suspendUser('${user.id}')" title="Suspender">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </button>
              <button class="icon-btn ghost" onclick="deleteUser('${user.id}')" title="Excluir">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </td>
        </tr>`,
    )
    .join("");

  const upstreamRows = input.upstreams
    .map(
      (u) => `
        <tr>
          <td>
            <div class="user-info">
              <span class="user-name">${u.name}</span>
              <span class="user-sub code">${u.id}</span>
            </div>
          </td>
          <td><span class="badge ${u.status.toLowerCase()}">${u.status}</span></td>
          <td><div class="code-block">${u.smartersUrl}<br/>${u.xciptvDns || "-"}</div></td>
          <td>
             <div class="actions">
              <button class="btn small" onclick="editUpstreamStatus('${u.id}', '${u.status}')">Status</button>
              <button class="btn small ghost" onclick="editUpstream('${u.id}', '${u.name}', '${u.smartersUrl}', '${u.xciptvDns || ""}', '${u.timeoutMs || 8000}')">Editar</button>
            </div>
          </td>
        </tr>`,
    )
    .join("");

  const maxHistory = Math.max(1, ...input.history.map((h) => Number(h?.redis?.activeSessionKeys || 0)));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${input.appName} — Gateway</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="/socket.io/socket.io.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg: #f5f5f7;
      --sidebar: rgba(255, 255, 255, 0.7);
      --card: #ffffff;
      --accent: #0071e3;
      --accent-hover: #0077ed;
      --text: #1d1d1f;
      --text-muted: #86868b;
      --border: rgba(0, 0, 0, 0.1);
      --success: #34c759;
      --warning: #ff9f0a;
      --danger: #ff3b30;
      --radius: 20px;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    /* Sidebar */
    .sidebar {
      width: 260px;
      background: var(--sidebar);
      backdrop-filter: blur(20px);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 24px;
      z-index: 100;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 40px;
    }

    .logo {
      width: 32px;
      height: 32px;
      background: var(--accent);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
    }

    .app-name { font-weight: 700; font-size: 1.1rem; }

    .nav { display: flex; flex-direction: column; gap: 8px; }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 12px;
      color: var(--text-muted);
      text-decoration: none;
      font-weight: 500;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .nav-item:hover, .nav-item.active {
      background: rgba(0, 113, 227, 0.1);
      color: var(--accent);
    }

    .nav-item svg { width: 20px; height: 20px; }

    /* Main Content */
    .main {
      flex: 1;
      overflow-y: auto;
      padding: 40px;
      position: relative;
    }

    .page {
      display: none;
      animation: fadeIn 0.4s ease-out;
    }

    .page.active { display: block; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    header { margin-bottom: 32px; }
    header h1 { margin: 0; font-size: 34px; font-weight: 700; letter-spacing: -0.02em; }
    header p { color: var(--text-muted); margin: 8px 0 0; }

    /* Grid Layout */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }

    .card {
      background: var(--card);
      border-radius: var(--radius);
      padding: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.03);
      border: 1px solid var(--border);
    }

    .card h3 { margin: 0 0 16px; font-size: 14px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .metric-value { font-size: 34px; font-weight: 700; display: block; }
    .metric-trend { font-size: 12px; margin-top: 8px; color: var(--success); }

    /* Tables */
    .table-container {
      background: var(--card);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      overflow: hidden;
    }

    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { padding: 16px 24px; color: var(--text-muted); font-size: 12px; text-transform: uppercase; background: #fafafa; border-bottom: 1px solid var(--border); }
    td { padding: 16px 24px; border-bottom: 1px solid var(--border); vertical-align: middle; }

    .user-info { display: flex; flex-direction: column; }
    .user-name { font-weight: 600; font-size: 15px; }
    .user-sub { font-size: 13px; color: var(--text-muted); }

    .badge {
      display: inline-flex;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge.active { background: #e3f9e8; color: #1a7a33; }
    .badge.disabled { background: #fee2e2; color: #b91c1c; }
    .badge.degraded { background: #fef3c7; color: #92400e; }

    .code { font-family: monospace; font-size: 12px; }
    .code-block { background: #f5f5f7; padding: 6px 10px; border-radius: 8px; font-family: monospace; font-size: 11px; width: fit-content; }

    /* Buttons */
    .btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn:hover { background: var(--accent-hover); }
    .btn.ghost { background: #f2f2f7; color: var(--text); }
    .btn.small { padding: 6px 12px; font-size: 12px; }

    .icon-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      transition: all 0.2s;
    }

    .icon-btn:hover { background: rgba(0,0,0,0.05); color: var(--text); }

    /* Forms */
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--text-muted); }
    .form-control {
      width: 100%;
      padding: 12px 16px;
      border-radius: 12px;
      border: 1px solid var(--border);
      font-size: 15px;
      transition: border-color 0.2s;
    }
    .form-control:focus { outline: none; border-color: var(--accent); }

    /* Real-time indicator */
    .rt-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--success);
      font-size: 12px;
      font-weight: 600;
    }
    .rt-dot {
      width: 8px;
      height: 8px;
      background: var(--success);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.5); opacity: 0.5; }
      100% { transform: scale(1); opacity: 1; }
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.3s ease;
    }

    .modal {
      background: var(--card);
      border-radius: var(--radius);
      width: 90%;
      max-width: 500px;
      padding: 32px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      position: relative;
      animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes slideUp {
      from { transform: translateY(30px) scale(0.95); opacity: 0; }
      to { transform: translateY(0) scale(1); opacity: 1; }
    }

    .modal h2 { margin-top: 0; font-size: 24px; margin-bottom: 24px; text-align: center; }
    
    .credential-card {
      background: #f5f5f7;
      border-radius: 12px;
      padding: 16px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
      margin-bottom: 24px;
      border: 1px solid var(--border);
      color: var(--text);
    }

    .modal-actions {
      display: flex;
      gap: 12px;
    }

    .modal-actions .btn { flex: 1; }
</head>
<body>

  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="logo">P</div>
      <div class="app-name">Gateway Pro</div>
    </div>

    <nav class="nav">
      <div class="nav-item active" onclick="showPage('dashboard', this)">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
        Dashboard
      </div>
      <div class="nav-item" onclick="showPage('users', this)">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
        Usuários
      </div>
      <div class="nav-item" onclick="showPage('upstreams', this)">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        Upstreams
      </div>
      <div class="nav-item" onclick="showPage('create-user', this)">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
        Novo Usuário
      </div>
    </nav>

    <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid var(--border);">
       <div class="rt-indicator">
          <div class="rt-dot"></div>
          Real-time Ligado
       </div>
    </div>
  </aside>

  <main class="main">
    
    <!-- DASHBOARD PAGE -->
    <div id="page-dashboard" class="page active">
      <header>
        <h1>Painel de Controle</h1>
        <p>Monitoramento de sessões, tráfego e saúde do servidor.</p>
      </header>

      <div class="grid">
        <div class="card">
          <h3>Sessões Ativas</h3>
          <span class="metric-value" id="m-sessions">${input.metrics.activeSessionKeys || 0}</span>
          <div class="metric-trend">Total em cache</div>
        </div>
        <div class="card">
          <h3>Heartbeats</h3>
          <span class="metric-value" id="m-heartbeats">${input.metrics.heartbeats || 0}</span>
          <div class="metric-trend">Atividade P2P</div>
        </div>
        <div class="card">
           <h3>Uso de Memória</h3>
           <span class="metric-value" id="m-memory">0 MB</span>
           <div class="metric-trend" style="color: var(--text-muted)">RSS Processo</div>
        </div>
        <div class="card">
           <h3>Uptime (sec)</h3>
           <span class="metric-value" id="m-uptime">0</span>
           <div class="metric-trend" style="color: var(--text-muted)">Tempo online</div>
        </div>
      </div>

      <div class="grid" style="grid-template-columns: 1fr 1fr;">
         <div class="card">
          <h3>IPs Bloqueados</h3>
          <span class="metric-value" id="m-blocked">${input.metrics.blockedIps || 0}</span>
          <div class="metric-trend" style="color: var(--danger)">Segurança</div>
        </div>
        <div class="card">
          <h3>Rate Buckets</h3>
          <span class="metric-value" id="m-buckets">${input.metrics.rateBuckets || 0}</span>
          <div class="metric-trend">Active limiters</div>
        </div>
      </div>

      <div class="card">
        <h3>Histórico de Sessões (Últimas 24h)</h3>
        <div class="chart-container">
          <canvas id="sessionsChart"></canvas>
        </div>
      </div>
    </div>

    <!-- USERS PAGE -->
    <div id="page-users" class="page">
      <header>
        <h1>Lista de Usuários</h1>
        <p>Gerencie quem tem acesso ao gateway e controle seus limites.</p>
      </header>
      
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Nome / Login</th>
              <th>Status</th>
              <th>Vencimento</th>
              <th>Max Conexões</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${userRows || '<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">Nenhum usuário encontrado.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- UPSTREAMS PAGE -->
    <div id="page-upstreams" class="page">
      <header>
        <h1>Infraestrutura Upstream</h1>
        <p>Configure os servidores de origem para onde o tráfego será redirecionado.</p>
      </header>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Nome / ID</th>
              <th>Status</th>
              <th>Endpoints</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${upstreamRows || '<tr><td colspan="4" style="text-align:center; padding: 40px; color: var(--text-muted);">Nenhum upstream configurado.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- CREATE USER PAGE -->
    <div id="page-create-user" class="page">
      <header>
        <h1>Criar Novo Acesso</h1>
        <p>Defina as credenciais e limites para o novo cliente.</p>
      </header>

      <div class="card" style="max-width: 600px;">
        ${input.defaultUpstreamId ? "" : '<div style="margin-bottom: 20px; color: var(--danger); font-size: 13px;">⚠️ Configure um upstream padrão primeiro.</div>'}
        <form onsubmit="createUser(event)">
          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 0;">
            <div class="form-group">
              <label>Nome do Cliente</label>
              <input name="fullName" class="form-control" placeholder="Ex: João Silva" required />
            </div>
            <div class="form-group">
              <label>Login (Username)</label>
              <input name="username" class="form-control" placeholder="usuario123" required />
            </div>
          </div>
          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 0;">
            <div class="form-group">
              <label>Senha</label>
              <input name="password" class="form-control" type="password" required />
            </div>
             <div class="form-group">
              <label>Max Conexões</label>
              <input name="maxConnections" class="form-control" type="number" value="1" required />
            </div>
          </div>
          <div class="form-group">
            <label>Data de Vencimento</label>
            <input name="expiresAt" class="form-control" type="datetime-local" value="${new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 16)}" required />
          </div>
          <div style="margin-top: 24px;">
            <button class="btn" type="submit" ${input.defaultUpstreamId ? "" : "disabled"} style="width: 100%; padding: 14px;">Criar Acesso Imediato</button>
          </div>
        </form>
      </div>
    </div>

  </main>
  
  <div id="credentials-modal" class="modal-overlay">
    <div class="modal">
      <h2>Acesso Criado</h2>
      <div id="credentials-content" class="credential-card"></div>
      <div class="modal-actions">
        <button class="btn" onclick="copyCredentials()">Copiar Credenciais</button>
        <button class="btn ghost" onclick="closeModal()">Fechar</button>
      </div>
    </div>
  </div>

  <script>
    const adminToken = ${JSON.stringify(input.adminToken)};
    const appBaseUrl = ${JSON.stringify(input.appBaseUrl)};
    const defaultUpstreamId = ${JSON.stringify(input.defaultUpstreamId)};
    const defaultUpstreamUsername = ${JSON.stringify(input.defaultUpstreamUsername)};
    const defaultUpstreamPassword = ${JSON.stringify(input.defaultUpstreamPassword)};
    const initialHistory = ${JSON.stringify(input.history)};

    function showPage(id, el) {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-' + id).classList.add('active');

      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      if (el) el.classList.add('active');
      else {
        // Find matching nav-item if el is not provided (e.g. on start)
        const items = document.querySelectorAll('.nav-item');
        items.forEach(item => {
           if(item.innerText.toLowerCase().includes(id.replace('-', ' '))) item.classList.add('active');
        });
      }
    }

    // Chart.js Setup
    const ctx = document.getElementById('sessionsChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: initialHistory.slice(-20).map(h => new Date(h.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})),
        datasets: [{
          label: 'Sessões',
          data: initialHistory.slice(-20).map(h => h.redis?.activeSessionKeys || 0),
          borderColor: '#0071e3',
          backgroundColor: 'rgba(0, 113, 227, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }
        }
      }
    });

    // WebSocket Connection
    const socket = io({
      auth: { token: adminToken }
    });

    socket.on('metrics:update', (metrics) => {
      document.getElementById('m-sessions').innerText = metrics.activeSessionKeys || 0;
      document.getElementById('m-heartbeats').innerText = metrics.heartbeats || 0;
      document.getElementById('m-blocked').innerText = metrics.blockedIps || 0;
      document.getElementById('m-buckets').innerText = metrics.rateBuckets || 0;
      
      if (metrics.system) {
        document.getElementById('m-memory').innerText = metrics.system.memory + ' MB';
        document.getElementById('m-uptime').innerText = metrics.system.uptime + 's';
      }

      // Update Chart
      const now = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      chart.data.labels.push(now);
      chart.data.datasets[0].data.push(metrics.activeSessionKeys || 0);

      if (chart.data.labels.length > 30) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
      }
      chart.update('none');
    });

    // API Handlers
    async function submitJson(path, method, payload) {
      const response = await fetch(path, {
        method,
        headers: {
          "content-type": "application/json",
          "x-admin-token": adminToken
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
      const res = await (await fetch("/admin/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": adminToken
        },
        body: JSON.stringify({
          fullName: form.get("fullName"),
          username: form.get("username"),
          password: form.get("password"),
          expiresAt: new Date(form.get("expiresAt")).toISOString(),
          maxConnections: Number(form.get("maxConnections")),
          upstreamId: defaultUpstreamId,
          upstreamUsername: defaultUpstreamUsername,
          upstreamPassword: defaultUpstreamPassword
        })
      }));

      if (!res.ok) {
        const text = await res.text();
        alert("Falha: " + text);
        return;
      }

      const data = await res.json();
      if (data.textCard) {
        showModal(data.textCard);
      } else {
        window.location.reload();
      }
    }

    function showModal(content) {
      document.getElementById('credentials-content').innerText = content;
      document.getElementById('credentials-modal').style.display = 'flex';
    }

    function closeModal() {
      document.getElementById('credentials-modal').style.display = 'none';
      window.location.reload();
    }

    async function copyCredentials() {
      const text = document.getElementById('credentials-content').innerText;
      await navigator.clipboard.writeText(text);
      alert("Copiado para a área de transferência!");
    }

    async function renewUser(id) {
       const expiresAt = prompt("Nova data ISO de vencimento", new Date(Date.now() + 86400000 * 30).toISOString());
       if (!expiresAt) return;
       await submitJson("/admin/users/" + id + "/renew", "POST", { expiresAt });
    }

    async function suspendUser(id) { await submitJson("/admin/users/" + id + "/suspend", "POST"); }
    async function deleteUser(id) { if (confirm("Remover usuário permanentemente?")) await submitJson("/admin/users/" + id, "DELETE"); }
    
    async function editUpstreamStatus(id, current) {
      const status = prompt("Novo status: ACTIVE, DEGRADED, DISABLED", current);
      if (status) await submitJson("/admin/upstreams/" + id, "PATCH", { status });
    }

    async function editUpstream(id, name, url, dns, timeout) {
      const nextName = prompt("Nome", name);
      const nextUrl = prompt("URL", url);
      const nextDns = prompt("DNS", dns);
      const nextTimeout = prompt("Timeout", timeout);
      if (nextName && nextUrl && nextTimeout) {
         await submitJson("/admin/upstreams/" + id, "PATCH", {
           name: nextName,
           smartersUrl: nextUrl,
           xciptvDns: nextDns,
           timeoutMs: Number(nextTimeout)
         });
      }
    }
  </script>
</body>
</html>`;
}
