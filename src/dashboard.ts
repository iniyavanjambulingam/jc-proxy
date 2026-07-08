export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>jcXproxy Admin</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e1e4e8; min-height: 100vh; }
.header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
.header h1 { font-size: 20px; font-weight: 600; }
.header .badge { background: #238636; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 12px; }
.container { max-width: 1100px; margin: 0 auto; padding: 24px; }
.card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; margin-bottom: 20px; }
.card-header { padding: 16px 20px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; }
.card-header h2 { font-size: 16px; font-weight: 600; }
.card-body { padding: 16px 20px; }
.btn { padding: 6px 14px; border-radius: 6px; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; cursor: pointer; font-size: 13px; transition: background 0.15s; }
.btn:hover { background: #30363d; }
.btn-primary { background: #238636; border-color: #238636; color: #fff; }
.btn-primary:hover { background: #2ea043; }
.btn-danger { background: #da3633; border-color: #da3633; color: #fff; }
.btn-danger:hover { background: #f85149; }
.btn-sm { padding: 3px 10px; font-size: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #21262d; font-size: 13px; }
th { color: #8b949e; font-weight: 500; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
.tag-groq { background: #1a3a2a; color: #3fb950; }
.tag-gemini { background: #1a2a3a; color: #58a6ff; }
.tag-openrouter { background: #3a2a1a; color: #d29922; }
.tag-cloudflare { background: #3a1a2a; color: #f78166; }
.tag-openai-compatible { background: #2a2a3a; color: #bc8cff; }
.tag-discovered { background: #1a3a2a; color: #3fb950; }
.tag-custom { background: #3a2a1a; color: #d29922; }
.tag-dedicated { background: #1a2a3a; color: #58a6ff; }
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 100; justify-content: center; align-items: center; }
.modal-overlay.active { display: flex; }
.modal { background: #161b22; border: 1px solid #30363d; border-radius: 12px; width: 560px; max-height: 90vh; overflow-y: auto; }
.modal-header { padding: 16px 20px; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { font-size: 16px; }
.modal-body { padding: 20px; }
.modal-footer { padding: 12px 20px; border-top: 1px solid #30363d; display: flex; justify-content: flex-end; gap: 8px; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-size: 12px; color: #8b949e; margin-bottom: 4px; }
.form-group input, .form-group select, .form-group textarea { width: 100%; padding: 8px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 13px; }
.form-group textarea { min-height: 60px; resize: vertical; font-family: monospace; }
.form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: #58a6ff; }
.alias-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.alias-row input { flex: 1; }
.empty { text-align: center; padding: 32px; color: #484f58; }
.close-btn { background: none; border: none; color: #8b949e; cursor: pointer; font-size: 18px; }
.close-btn:hover { color: #c9d1d9; }
.toast { position: fixed; bottom: 24px; right: 24px; background: #238636; color: #fff; padding: 10px 20px; border-radius: 8px; font-size: 13px; z-index: 200; opacity: 0; transition: opacity 0.3s; }
.toast.show { opacity: 1; }
.provider-detail { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
.provider-detail h4 { font-size: 14px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.provider-detail .meta { font-size: 12px; color: #8b949e; margin-bottom: 4px; }
.provider-detail .caps { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.cap { padding: 2px 6px; border-radius: 4px; font-size: 10px; background: #21262d; color: #8b949e; }
.cap.on { background: #1a3a2a; color: #3fb950; }
.models-list { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
.model-tag { padding: 2px 6px; border-radius: 4px; font-size: 10px; background: #21262d; color: #c9d1d9; }
.health-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.health-dot.healthy { background: #3fb950; }
.health-dot.unhealthy { background: #da3633; }
.type-card { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; margin-bottom: 12px; }
.type-card-header { padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
.type-card-header:hover { background: #161b22; border-radius: 6px; }
.type-card-header-left { display: flex; align-items: center; gap: 8px; }
.type-card-header-left h3 { font-size: 14px; font-weight: 600; }
.type-card-header-left .count { font-size: 12px; color: #8b949e; }
.type-card-header-right { display: flex; align-items: center; gap: 8px; }
.type-card-toggle { font-size: 11px; color: #8b949e; transition: transform 0.2s; display: inline-block; }
.type-card-toggle.collapsed { transform: rotate(-90deg); }
.type-card-body { padding: 0 12px 12px 12px; }
.type-card-body.collapsed { display: none; }
.login-overlay { position: fixed; inset: 0; background: #0f1117; z-index: 500; display: flex; justify-content: center; align-items: center; }
.login-box { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 32px; width: 380px; text-align: center; }
.login-box h2 { font-size: 18px; margin-bottom: 8px; }
.login-box p { font-size: 13px; color: #8b949e; margin-bottom: 20px; }
.login-box input { width: 100%; padding: 10px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 14px; margin-bottom: 12px; text-align: center; }
.login-box input:focus { outline: none; border-color: #58a6ff; }
.login-error { color: #da3633; font-size: 12px; margin-bottom: 12px; display: none; }
</style>
</head>
<body>

<div class="login-overlay" id="loginOverlay">
  <div class="login-box">
    <h2>Admin Login</h2>
    <p>Enter your admin key to access the dashboard.</p>
    <div class="login-error" id="loginError">Invalid admin key</div>
    <input id="adminKeyInput" type="password" placeholder="Admin key" autofocus>
    <button class="btn btn-primary" style="width:100%;" onclick="submitLogin()">Login</button>
  </div>
</div>

<div id="dashboardContent" style="display:none;">

<div class="header">
  <h1>jcXproxy</h1>
  <span class="badge">Admin</span>
  <button class="btn btn-danger" style="margin-left: auto;" onclick="logout()">Logout</button>
</div>

<div class="container">
  <div class="card">
    <div class="card-header">
      <h2>Channels (Providers)</h2>
      <button class="btn btn-primary" onclick="openAddProvider()">+ Add Channel</button>
    </div>
    <div class="card-body" id="providersContainer">
      <div id="noProviders" class="empty">No providers configured</div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>Routing</h2>
    </div>
    <div class="card-body">
      <div class="form-group">
        <label>Mode</label>
        <select id="routingMode" onchange="saveRoutingMode()">
          <option value="priority">Priority</option>
          <option value="round-robin">Round Robin</option>
          <option value="random">Random</option>
        </select>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>Web Search Grounding</h2>
    </div>
    <div class="card-body">
      <div class="form-group">
        <label>Tavily Search API Key (Optional)</label>
        <input type="password" id="tavilyApiKey" placeholder="e.g. tvly-..." onchange="saveWebSearch()">
      </div>
      <div class="form-group">
        <label>Brave Search API Key (Optional)</label>
        <input type="password" id="braveApiKey" placeholder="e.g. bsv1_..." onchange="saveWebSearch()">
      </div>
      <div class="form-group">
        <label>SearXNG Instance URL (Optional - e.g., http://localhost:8080)</label>
        <input type="text" id="searxngUrl" placeholder="e.g. http://127.0.0.1:8080" onchange="saveWebSearch()">
      </div>
      <div style="font-size: 12px; color: #8b949e; margin-top: 4px;">
        💡 If neither is provided, the proxy automatically falls back to a free, built-in <strong>DuckDuckGo</strong> scraper.
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>Claude Code</h2>
    </div>
    <div class="card-body">
      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="checkbox" id="claudeCodeEnabled" onchange="saveClaudeCode()" style="width: auto;">
          Enable Claude Code routing
        </label>
        <div style="font-size: 12px; color: #8b949e; margin-top: 4px; margin-left: 24px;">
          Routes all requests with model names starting with "claude-" to a configured model.
        </div>
      </div>
      <div class="form-group">
        <label>Target Model</label>
        <select id="claudeCodeTarget" onchange="saveClaudeCode()">
          <option value="">Select a model...</option>
        </select>
      </div>
      <div class="form-group">
        <label>Fallback Models (tried in order if target is unavailable)</label>
        <div id="claudeCodeFallbacks"></div>
        <button class="btn btn-sm" style="margin-top: 8px;" onclick="addClaudeCodeFallback()">+ Add Fallback</button>
      </div>
    </div>
    <div style="padding: 0 20px 20px 20px; display: flex; justify-content: flex-end;">
      <button class="btn btn-primary" onclick="saveClaudeCode()">Save</button>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>API Keys</h2>
      <button class="btn btn-primary" onclick="openAddKey()">+ Add Key</button>
    </div>
    <div class="card-body">
      <table>
        <thead><tr><th>Key</th><th></th></tr></thead>
        <tbody id="keysTable"></tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>Model Aliases</h2>
      <button class="btn btn-primary" onclick="addAliasRow()">+ Add Alias</button>
    </div>
    <div class="card-body" id="aliasesBody"></div>
    <div style="padding: 0 20px 20px 20px; display: flex; justify-content: flex-end;">
      <button class="btn btn-primary" onclick="saveAliases()">Save Aliases</button>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>Fallback Chains</h2>
      <button class="btn btn-primary" onclick="addFallbackChain()">+ Add Chain</button>
    </div>
    <div class="card-body" id="fallbacksBody"></div>
    <div style="padding: 0 20px 20px 20px; display: flex; justify-content: flex-end;">
      <button class="btn btn-primary" onclick="saveFallbacks()">Save Fallback Chains</button>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>API Logs</h2>
      <div>
        <select id="logFilter" onchange="renderLogs()" style="padding: 4px 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 13px; margin-right: 8px;">
          <option value="">All Providers</option>
        </select>
        <button class="btn btn-sm" onclick="fetchAndRenderLogs()">Refresh</button>
        <button class="btn btn-sm btn-danger" onclick="clearAllLogs()">Clear</button>
      </div>
    </div>
    <div class="card-body" style="max-height: 400px; overflow-y: auto;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="width: 180px;">Time</th>
            <th style="width: 140px;">Channel</th>
            <th>Model</th>
            <th style="width: 100px;">Latency</th>
            <th style="width: 80px;">Status</th>
            <th style="width: 80px;">Retry</th>
          </tr>
        </thead>
        <tbody id="logsTableBody">
          <tr><td colspan="6" class="empty">No logs available</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<div class="modal-overlay" id="providerModal">
  <div class="modal">
    <div class="modal-header">
      <h3 id="providerModalTitle">Add Channel</h3>
      <button class="close-btn" onclick="closeModal('providerModal')">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>ID (auto-generated)</label>
        <input id="provId" readonly style="background: #161b22; color: #8b949e;">
      </div>
      <div class="form-group">
        <label>Nickname (optional)</label>
        <input id="provNickname" placeholder="e.g. Primary Gemini Key">
      </div>
      <div class="form-group">
        <label>Type</label>
        <select id="provType">
          <option value="groq">Groq</option>
          <option value="gemini">Gemini</option>
          <option value="openrouter">OpenRouter</option>
          <option value="cloudflare">Cloudflare</option>
          <option value="openai-compatible">OpenAI Compatible</option>
        </select>
      </div>
      <div class="form-group">
        <label>Base URL (optional - uses default if empty)</label>
        <input id="provBaseUrl" placeholder="https://api.groq.com/openai/v1">
      </div>
      <div class="form-group">
        <label>API Key</label>
        <input id="provApiKey" type="password" placeholder="sk-...">
      </div>
      <div class="form-group" id="provAccountIdGroup" style="display:none">
        <label>Account ID</label>
        <input id="provAccountId" placeholder="Cloudflare account ID">
      </div>
      
      <!-- Model Selector Group -->
      <div class="form-group" id="provModelSelectorGroup" style="display:none;">
        <label>Enabled Models (Select models to enable, or leave all unchecked to enable all)</label>
        <div style="margin-bottom: 8px; display: flex; gap: 8px;">
          <input id="modelSearch" placeholder="Search models..." oninput="filterModelSelectorList()" style="flex: 1; padding: 4px 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9;">
          <button class="btn btn-sm" onclick="selectAllModels(true); return false;">Select All</button>
          <button class="btn btn-sm" onclick="selectAllModels(false); return false;">Deselect All</button>
        </div>
        <div id="modelSelectorList" style="max-height: 180px; overflow-y: auto; border: 1px solid #30363d; padding: 8px; border-radius: 6px; background: #0d1117;">
        </div>
      </div>

      <div class="form-group">
        <label>Custom Models (one per line, optional)</label>
        <textarea id="provCustomModels" placeholder="llama3.2:3b&#10;qwen2.5-coder"></textarea>
      </div>
      <div class="form-group">
        <label>Dedicated Models (one per line, optional)</label>
        <textarea id="provDedicatedModels" placeholder="my-finetuned-v1&#10;my-finetuned-v2"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal('providerModal')">Cancel</button>
      <button class="btn btn-primary" onclick="saveProvider()">Save</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="keyModal">
  <div class="modal">
    <div class="modal-header">
      <h3>Add API Key</h3>
      <button class="close-btn" onclick="closeModal('keyModal')">&times;</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>API Key</label>
        <input id="newKey" placeholder="sk-...">
      </div>
      <div class="form-group">
        <label>Allowed Models (Select models to allow, or leave empty to allow all)</label>
        <div style="margin-bottom: 8px; display: flex; gap: 8px;">
          <input id="keyModelSearch" placeholder="Search models..." oninput="filterKeyModelSelectorList()" style="flex: 1; padding: 4px 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9;">
          <button class="btn btn-sm" onclick="selectAllKeyModels(true); return false;">Select All</button>
          <button class="btn btn-sm" onclick="selectAllKeyModels(false); return false;">Deselect All</button>
        </div>
        <div id="keyModelSelectorList" style="max-height: 180px; overflow-y: auto; border: 1px solid #30363d; padding: 8px; border-radius: 6px; background: #0d1117;">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="closeModal('keyModal')">Cancel</button>
      <button class="btn btn-primary" onclick="addKey()">Add</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

</div>

<script>
let isLoggedIn = false;

function adminFetch(url, options = {}) {
  return fetch(url, options);
}

async function checkSession() {
  try {
    const res = await fetch('/admin/api/config');
    if (res.ok) {
      isLoggedIn = true;
      document.getElementById('loginOverlay').style.display = 'none';
      document.getElementById('dashboardContent').style.display = 'block';
      await loadConfig();
      setInterval(fetchAndRenderLogs, 5000);
    }
  } catch {}
}

checkSession();

async function submitLogin() {
  const input = document.getElementById('adminKeyInput');
  const key = input.value.trim();
  if (!key) return;

  try {
    const res = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey: key }),
    });
    if (res.status === 401) {
      document.getElementById('loginError').style.display = 'block';
      input.value = '';
      input.focus();
      return;
    }
    isLoggedIn = true;
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('dashboardContent').style.display = 'block';
    document.getElementById('loginError').style.display = 'none';
    await loadConfig();
    setInterval(fetchAndRenderLogs, 5000);
  } catch {
    document.getElementById('loginError').textContent = 'Connection error';
    document.getElementById('loginError').style.display = 'block';
  }
}

async function logout() {
  await fetch('/admin/api/logout', { method: 'POST' });
  isLoggedIn = false;
  window.location.reload();
}

document.getElementById('adminKeyInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') submitLogin();
});

let editingProvider = null;
let providerModels = {};
let providerHealth = {};
let allLogs = [];

async function loadConfig() {
  const res = await adminFetch('/admin/api/config');
  const cfg = await res.json();
  window.currentConfig = cfg;

  // Populate log filter dropdown
  const logFilter = document.getElementById('logFilter');
  const currentVal = logFilter.value;
  logFilter.innerHTML = '<option value="">All Channels</option>' + 
    cfg.routing.providers.map(p => {
      const name = p.nickname ? p.nickname + ' (' + p.id + ')' : p.id;
      return \`<option value="\${p.id}">\${name} (\${p.type})</option>\`;
    }).join('');
  logFilter.value = currentVal;

  await loadProviderDetails();
  renderProviders(cfg.routing.providers);
  renderKeys(cfg.apiKeys);
  document.getElementById('routingMode').value = cfg.routing.mode;
  document.getElementById('tavilyApiKey').value = cfg.webSearch?.tavilyApiKey || '';
  document.getElementById('braveApiKey').value = cfg.webSearch?.braveApiKey || '';
  document.getElementById('searxngUrl').value = cfg.webSearch?.searxngUrl || '';
  renderAliases(cfg.aliases || {});
  renderFallbacks(cfg.fallbackChains || {});
  renderClaudeCode(cfg);

  await fetchAndRenderLogs();
}

async function loadProviderDetails() {
  providerHealth = {};
  providerModels = {};

  try {
    const healthRes = await adminFetch('/admin/api/health');
    const healthData = await healthRes.json();
    for (const p of healthData.providers) {
      providerHealth[p.id] = p;
    }
  } catch {}

  const providerIds = window.currentConfig?.routing?.providers?.map(p => p.id) || [];
  for (const p of providerIds) {
    try {
      const modelsRes = await adminFetch(\`/admin/api/providers/\${p}/models\`);
      const modelsData = await modelsRes.json();
      providerModels[p] = modelsData.models || [];
    } catch {
      providerModels[p] = [];
    }
  }
}

function renderProviderCard(p) {
  const health = providerHealth[p.id] || {};
  const models = providerModels[p.id] || [];
  const caps = health.capabilities || {};
  const capList = ['tools','streaming','vision','embeddings','jsonMode','reasoning'];

  const enabledModelsCount = p.enabledModels ? p.enabledModels.length : 0;
  const modelsCountStr = enabledModelsCount > 0
    ? \`\${enabledModelsCount} / \${models.length} enabled\`
    : \`\${models.length} discovered\`;

  const displayModels = p.enabledModels && p.enabledModels.length > 0
    ? models.filter(m => p.enabledModels.includes(m.id))
    : models;

  return \`
  <div class="provider-detail">
    <h4>
      <span class="health-dot \${health.healthy !== false ? 'healthy' : 'unhealthy'}"></span>
      \${p.nickname ? p.nickname + ' <code style="font-size:11px; font-weight:normal; color:#8b949e;">(' + p.id + ')</code>' : p.id}
      <span class="tag tag-\${p.type}">\${p.type}</span>
    </h4>
    <div class="meta">Base URL: \${p.baseUrl || '(default)'}</div>
    <div class="meta">API Key: \${p.apiKey || '-'}</div>
    \${p.accountId ? '<div class="meta">Account ID: ' + p.accountId + '</div>' : ''}
    <div class="meta">Health: \${health.successCount || 0} ok / \${health.failureCount || 0} fail / \${health.rateLimitCount || 0} 429 / latency \${health.latency || 0}ms</div>
    <div class="caps">\${capList.map(c => \`<span class="cap \${caps[c] ? 'on' : ''}">\${c}</span>\`).join('')}</div>
    <div class="meta" style="margin-top:8px">Models (\${modelsCountStr}):</div>
    <div class="models-list">\${displayModels.slice(0, 20).map(m => \`<span class="model-tag" title="\${m.source}">\${m.id}</span>\`).join('')}\${displayModels.length > 20 ? '<span class="model-tag">+' + (displayModels.length - 20) + ' more</span>' : ''}</div>
    <div style="margin-top:8px">
      <button class="btn btn-sm" onclick="refreshModels('\${p.id}')">Refresh Models</button>
      <button class="btn btn-sm" onclick="editProvider('\${p.id}')">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteProvider('\${p.id}')">Delete</button>
    </div>
  </div>
  \`;
}

function groupByType(providers) {
  const groups = {};
  for (const p of providers) {
    if (!groups[p.type]) groups[p.type] = [];
    groups[p.type].push(p);
  }
  return groups;
}

const TYPE_LABELS = { groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter', cloudflare: 'Cloudflare', 'openai-compatible': 'OpenAI Compatible' };

function renderProviders(providers) {
  const container = document.getElementById('providersContainer');
  const empty = document.getElementById('noProviders');
  if (!providers.length) { container.innerHTML = ''; container.appendChild(empty); empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  const groups = groupByType(providers);
  const savedState = JSON.parse(localStorage.getItem('jcGroupCollapse') || '{}');

  container.innerHTML = Object.keys(groups).map(type => {
    const list = groups[type];
    const collapsed = savedState[type] === true;
    const label = TYPE_LABELS[type] || type;
    return \`
    <div class="type-card" data-type="\${type}">
      <div class="type-card-header" onclick="toggleTypeGroup('\${type}')">
        <div class="type-card-header-left">
          <span class="type-card-toggle \${collapsed ? 'collapsed' : ''}" id="toggle-\${type}">▼</span>
          <h3>\${label}</h3>
          <span class="count">(\${list.length})</span>
        </div>
        <div class="type-card-header-right">
          <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); openAddProvider('\${type}')">+ Add \${label} Channel</button>
        </div>
      </div>
      <div class="type-card-body \${collapsed ? 'collapsed' : ''}" id="body-\${type}">
        \${list.map(p => renderProviderCard(p)).join('')}
      </div>
    </div>
    \`;
  }).join('');
}

function toggleTypeGroup(type) {
  const body = document.getElementById('body-' + type);
  const toggle = document.getElementById('toggle-' + type);
  const isCollapsed = body.classList.toggle('collapsed');
  toggle.classList.toggle('collapsed', isCollapsed);
  const saved = JSON.parse(localStorage.getItem('jcGroupCollapse') || '{}');
  saved[type] = isCollapsed;
  localStorage.setItem('jcGroupCollapse', JSON.stringify(saved));
}

function renderKeys(keys) {
  const list = keys || [];
  document.getElementById('keysTable').innerHTML = list.map(k => {
    const keyStr = typeof k === 'string' ? k : k.key;
    const allowed = (k.allowedModels && k.allowedModels.length) ? k.allowedModels.join(', ') : 'All models allowed';
    return \`
      <tr>
        <td>
          <code>\${keyStr}</code>
          <div style="font-size: 11px; color: #8b949e; margin-top: 4px;">Allowed: \${allowed}</div>
        </td>
        <td style="text-align: right;"><button class="btn btn-sm btn-danger" onclick="deleteKey('\${keyStr}')">Delete</button></td>
      </tr>
    \`;
  }).join('');
}

function renderAliases(aliases) {
  const body = document.getElementById('aliasesBody');
  const names = Object.keys(aliases);
  if (!names.length) {
    body.innerHTML = '<div class="empty">No aliases configured</div>';
    return;
  }
  body.innerHTML = names.map(name => \`
    <div class="alias-row">
      <input value="\${name}" data-alias-name placeholder="Alias name" style="max-width:140px">
      <input value="\${aliases[name].join(', ')}" data-alias-models placeholder="model1, model2">
      <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">X</button>
    </div>
  \`);
}

function addAliasRow() {
  const body = document.getElementById('aliasesBody');
  const empty = body.querySelector('.empty');
  if (empty) empty.remove();
  const row = document.createElement('div');
  row.className = 'alias-row';
  row.innerHTML = \`
    <input data-alias-name placeholder="Alias name" style="max-width:140px">
    <input data-alias-models placeholder="model1, model2">
    <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">X</button>
  \`;
  body.appendChild(row);
}

async function saveAliases() {
  const rows = document.querySelectorAll('.alias-row');
  const aliases = {};
  rows.forEach(row => {
    const name = row.querySelector('[data-alias-name]').value.trim();
    const models = row.querySelector('[data-alias-models]').value.split(',').map(s => s.trim()).filter(Boolean);
    if (name && models.length) aliases[name] = models;
  });
  await adminFetch('/admin/api/aliases', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(aliases),
  });
  toast('Aliases saved');
  await loadConfig();
}

function renderFallbacks(chains) {
  const body = document.getElementById('fallbacksBody');
  const names = Object.keys(chains);
  if (!names.length) {
    body.innerHTML = '<div class="empty">No fallback chains configured</div>';
    return;
  }
  body.innerHTML = names.map(name => {
    const models = chains[name] || [];
    return \`
      <div class="fallback-chain" data-primary="\${name}" style="margin-bottom: 12px; padding: 12px; background: #0d1117; border: 1px solid #21262d; border-radius: 6px;">
        <div class="alias-row">
          <input value="\${name}" data-fallback-primary placeholder="Primary model" style="max-width:200px">
          <button class="btn btn-sm btn-danger" onclick="this.closest('.fallback-chain').remove()">X</button>
        </div>
        <div class="fallback-models" style="margin-left: 20px; margin-top: 8px;">
          \${models.map((m, i) => \`
            <div class="alias-row fallback-model-row">
              <span style="color: #8b949e; font-size: 12px; min-width: 20px;">\${i + 1}.</span>
              <input value="\${m}" data-fallback-model placeholder="Fallback model">
              <button class="btn btn-sm" onclick="moveFallbackModel(this, -1)" \${i === 0 ? 'disabled' : ''}>&#9650;</button>
              <button class="btn btn-sm" onclick="moveFallbackModel(this, 1)" \${i === models.length - 1 ? 'disabled' : ''}>&#9660;</button>
              <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">X</button>
            </div>
          \`).join('')}
        </div>
        <button class="btn btn-sm" style="margin-left: 20px; margin-top: 8px;" onclick="addFallbackModel(this)">+ Add Fallback</button>
      </div>
    \`;
  }).join('');
}

function addFallbackChain() {
  const body = document.getElementById('fallbacksBody');
  const empty = body.querySelector('.empty');
  if (empty) empty.remove();
  const chain = document.createElement('div');
  chain.className = 'fallback-chain';
  chain.dataset.primary = '';
  chain.innerHTML = \`
    <div class="alias-row">
      <input data-fallback-primary placeholder="Primary model" style="max-width:200px">
      <button class="btn btn-sm btn-danger" onclick="this.closest('.fallback-chain').remove()">X</button>
    </div>
    <div class="fallback-models" style="margin-left: 20px; margin-top: 8px;"></div>
    <button class="btn btn-sm" style="margin-left: 20px; margin-top: 8px;" onclick="addFallbackModel(this)">+ Add Fallback</button>
  \`;
  body.appendChild(chain);
}

function addFallbackModel(btn) {
  const models = btn.previousElementSibling;
  const count = models.children.length;
  const row = document.createElement('div');
  row.className = 'alias-row fallback-model-row';
  row.innerHTML = \`
    <span style="color: #8b949e; font-size: 12px; min-width: 20px;">\${count + 1}.</span>
    <input data-fallback-model placeholder="Fallback model">
    <button class="btn btn-sm" onclick="moveFallbackModel(this, -1)">&#9650;</button>
    <button class="btn btn-sm" onclick="moveFallbackModel(this, 1)">&#9660;</button>
    <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">X</button>
  \`;
  models.appendChild(row);
}

function moveFallbackModel(btn, dir) {
  const row = btn.parentElement;
  const models = row.parentElement;
  const idx = Array.from(models.children).indexOf(row);
  const target = idx + dir;
  if (target < 0 || target >= models.children.length) return;
  if (dir === -1) models.insertBefore(row, models.children[target]);
  else models.insertBefore(row, models.children[target].nextSibling);
  renumberFallbackModels(models);
}

function renumberFallbackModels(models) {
  Array.from(models.children).forEach((row, i) => {
    const span = row.querySelector('span');
    if (span) span.textContent = (i + 1) + '.';
    const upBtn = row.querySelectorAll('.btn')[0];
    const downBtn = row.querySelectorAll('.btn')[1];
    if (upBtn) upBtn.disabled = i === 0;
    if (downBtn) downBtn.disabled = i === models.children.length - 1;
  });
}

async function saveFallbacks() {
  const chains = {};
  document.querySelectorAll('.fallback-chain').forEach(chain => {
    const primary = chain.querySelector('[data-fallback-primary]').value.trim();
    if (!primary) return;
    const models = [];
    chain.querySelectorAll('[data-fallback-model]').forEach(input => {
      const val = input.value.trim();
      if (val) models.push(val);
    });
    if (models.length) chains[primary] = models;
  });
  await adminFetch('/admin/api/fallbacks', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chains),
  });
  toast('Fallback chains saved');
  await loadConfig();
}

function generateProviderId() {
  const providers = window.currentConfig?.routing?.providers || [];
  const usedIds = new Set(providers.map(p => p.id));
  let idx = 1;
  while (usedIds.has(String(idx))) idx++;
  return String(idx);
}

function openAddProvider(type) {
  editingProvider = null;
  document.getElementById('providerModalTitle').textContent = 'Add Channel';
  document.getElementById('provId').value = generateProviderId();
  document.getElementById('provId').disabled = true;
  document.getElementById('provNickname').value = '';
  document.getElementById('provType').value = type || 'groq';
  document.getElementById('provBaseUrl').value = '';
  document.getElementById('provApiKey').value = '';
  document.getElementById('provAccountId').value = '';
  document.getElementById('provCustomModels').value = '';
  document.getElementById('provDedicatedModels').value = '';

  const typeVal = type || 'groq';
  document.getElementById('provAccountIdGroup').style.display = typeVal === 'cloudflare' ? 'block' : 'none';
  document.getElementById('provModelSelectorGroup').style.display = 'block';
  loadNewProviderModelSelector(typeVal);

  document.getElementById('providerModal').classList.add('active');
}

async function loadNewProviderModelSelector(type) {
  const listContainer = document.getElementById('modelSelectorList');
  listContainer.innerHTML = '<div style="color: #8b949e; font-size: 12px; padding: 4px;">Loading models...</div>';
  document.getElementById('modelSearch').value = '';

  try {
    const res = await adminFetch('/admin/api/models');
    const data = await res.json();
    const allModels = data.models || [];
    const models = allModels.filter(m => !type || m.source === type || m.owned_by === type);

    if (models.length === 0) {
      listContainer.innerHTML = '<div style="color: #8b949e; font-size: 12px; padding: 4px;">No models discovered yet. Save the channel first, then click "Refresh Models" on the provider card.</div>';
      return;
    }

    models.sort((a, b) => a.id.localeCompare(b.id));

    listContainer.innerHTML = models.map(m => \`
      <div class="model-select-item" data-model-id="\${m.id}" style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; padding: 2px 4px; border-radius: 4px;">
        <input type="checkbox" id="chk-\${m.id}" value="\${m.id}" style="width: auto; margin: 0; cursor: pointer;">
        <label for="chk-\${m.id}" style="display: inline; font-size: 13px; color: #c9d1d9; cursor: pointer; user-select: none;">
          \${m.id} <span style="font-size: 10px; color: #8b949e;">(\${m.source})</span>
        </label>
      </div>
    \`).join('');
  } catch (err) {
    listContainer.innerHTML = '<div style="color: #da3633; font-size: 12px; padding: 4px;">Error loading models</div>';
  }
}

async function loadModelSelector(providerId, enabledModels) {
  const listContainer = document.getElementById('modelSelectorList');
  listContainer.innerHTML = '<div style="color: #8b949e; font-size: 12px; padding: 4px;">Loading models...</div>';
  document.getElementById('modelSearch').value = '';
  
  try {
    const res = await adminFetch(\`/admin/api/providers/\${providerId}/models\`);
    const data = await res.json();
    const models = data.models || [];
    
    if (models.length === 0) {
      listContainer.innerHTML = '<div style="color: #8b949e; font-size: 12px; padding: 4px;">No models discovered yet. Click "Refresh Models" on the provider card first.</div>';
      return;
    }
    
    models.sort((a, b) => a.id.localeCompare(b.id));
    const enabledSet = new Set(enabledModels || []);
    
    listContainer.innerHTML = models.map(m => {
      const checked = enabledSet.has(m.id) ? 'checked' : '';
      return \`
        <div class="model-select-item" data-model-id="\${m.id}" style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; padding: 2px 4px; border-radius: 4px;">
          <input type="checkbox" id="chk-\${m.id}" value="\${m.id}" \${checked} style="width: auto; margin: 0; cursor: pointer;">
          <label for="chk-\${m.id}" style="display: inline; font-size: 13px; color: #c9d1d9; cursor: pointer; user-select: none;">
            \${m.id} <span style="font-size: 10px; color: #8b949e;">(\${m.source})</span>
          </label>
        </div>
      \`;
    }).join('');
  } catch (err) {
    listContainer.innerHTML = '<div style="color: #da3633; font-size: 12px; padding: 4px;">Error loading models</div>';
  }
}

function filterModelSelectorList() {
  const q = document.getElementById('modelSearch').value.toLowerCase();
  const items = document.querySelectorAll('.model-select-item');
  items.forEach(item => {
    const modelId = item.getAttribute('data-model-id').toLowerCase();
    item.style.display = modelId.includes(q) ? 'flex' : 'none';
  });
}

function selectAllModels(select) {
  const q = document.getElementById('modelSearch').value.toLowerCase();
  const items = document.querySelectorAll('.model-select-item');
  items.forEach(item => {
    const modelId = item.getAttribute('data-model-id').toLowerCase();
    if (!q || modelId.includes(q)) {
      const cb = item.querySelector('input[type="checkbox"]');
      cb.checked = select;
    }
  });
}

function editProvider(id) {
  editingProvider = id;
  const p = window.currentConfig?.routing?.providers?.find(x => x.id === id);
  if (!p) return;

  document.getElementById('providerModalTitle').textContent = 'Edit Channel';
  document.getElementById('provId').value = p.id;
  document.getElementById('provId').disabled = true;
  document.getElementById('provNickname').value = p.nickname || '';
  document.getElementById('provType').value = p.type;
  document.getElementById('provBaseUrl').value = p.baseUrl || '';
  document.getElementById('provApiKey').value = p.apiKey || '';
  document.getElementById('provAccountId').value = p.accountId || '';
  document.getElementById('provCustomModels').value = (p.customModels || []).join('\\n');
  document.getElementById('provDedicatedModels').value = (p.dedicatedModels || []).join('\\n');
  
  document.getElementById('provAccountIdGroup').style.display = p.type === 'cloudflare' ? 'block' : 'none';
  document.getElementById('provModelSelectorGroup').style.display = 'block';
  
  loadModelSelector(p.id, p.enabledModels);
  document.getElementById('providerModal').classList.add('active');
}

async function saveProvider() {
  const customModelsText = document.getElementById('provCustomModels').value.trim();
  const dedicatedModelsText = document.getElementById('provDedicatedModels').value.trim();
  const data = {
    id: document.getElementById('provId').value.trim(),
    nickname: document.getElementById('provNickname').value.trim() || undefined,
    type: document.getElementById('provType').value,
    baseUrl: document.getElementById('provBaseUrl').value.trim() || undefined,
    apiKey: document.getElementById('provApiKey').value.trim() || undefined,
  };
  if (data.type === 'cloudflare') {
    data.accountId = document.getElementById('provAccountId').value.trim();
  }
  if (customModelsText) {
    data.customModels = customModelsText.split('\\n').map(s => s.trim()).filter(Boolean);
  } else {
    data.customModels = [];
  }
  if (dedicatedModelsText) {
    data.dedicatedModels = dedicatedModelsText.split('\\n').map(s => s.trim()).filter(Boolean);
  } else {
    data.dedicatedModels = [];
  }

  const checkedBoxes = document.querySelectorAll('#modelSelectorList input[type="checkbox"]:checked');
  data.enabledModels = Array.from(checkedBoxes).map(cb => cb.value);

  if (!data.id) { toast('ID is required'); return; }
  
  if (editingProvider) {
    await adminFetch(\`/admin/api/providers/\${editingProvider}\`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } else {
    await adminFetch('/admin/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }
  closeModal('providerModal');
  toast('Channel saved');
  await loadConfig();
}

async function deleteProvider(id) {
  if (!confirm(\`Delete channel "\${id}"?\`)) return;
  await adminFetch(\`/admin/api/providers/\${id}\`, { method: 'DELETE' });
  toast('Channel deleted');
  await loadConfig();
}

async function refreshModels(id) {
  toast('Refreshing models...');
  await adminFetch(\`/admin/api/providers/\${id}/refresh-models\`, { method: 'POST' });
  await loadConfig();
  toast('Models refreshed');
}

async function saveRoutingMode() {
  const mode = document.getElementById('routingMode').value;
  await adminFetch('/admin/api/routing', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  toast('Routing mode saved');
  await loadConfig();
}

async function saveWebSearch() {
  const tavilyApiKey = document.getElementById('tavilyApiKey').value.trim();
  const braveApiKey = document.getElementById('braveApiKey').value.trim();
  const searxngUrl = document.getElementById('searxngUrl').value.trim();
  await adminFetch('/admin/api/config/websearch', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tavilyApiKey, braveApiKey, searxngUrl }),
  });
  toast('Web search settings saved');
  await loadConfig();
}

function renderClaudeCode(cfg) {
  const cc = cfg.claudeCode || {};
  document.getElementById('claudeCodeEnabled').checked = !!cc.enabled;

  const target = document.getElementById('claudeCodeTarget');
  const allModels = [];
  for (const models of Object.values(providerModels)) {
    for (const m of models) {
      if (!allModels.find(x => x.id === m.id)) allModels.push(m);
    }
  }
  allModels.sort((a, b) => a.id.localeCompare(b.id));
  const currentTarget = cc.target || '';
  target.innerHTML = '<option value="">Select a model...</option>' +
    allModels.map(m => \`<option value="\${m.id}" \${m.id === currentTarget ? 'selected' : ''}>\${m.id}</option>\`).join('');

  const body = document.getElementById('claudeCodeFallbacks');
  const fallbacks = cc.fallbacks || [];
  if (!fallbacks.length) {
    body.innerHTML = '<div style="padding: 8px 0; color: #484f58; font-size: 13px;">No fallbacks configured</div>';
    return;
  }
  body.innerHTML = fallbacks.map((m, i) => \`
    <div class="alias-row fallback-model-row">
      <span style="color: #8b949e; font-size: 12px; min-width: 20px;">\${i + 1}.</span>
      <input value="\${m}" data-cc-fallback placeholder="model name">
      <button class="btn btn-sm" onclick="moveClaudeCodeFallback(this, -1)" \${i === 0 ? 'disabled' : ''}>&#9650;</button>
      <button class="btn btn-sm" onclick="moveClaudeCodeFallback(this, 1)" \${i === fallbacks.length - 1 ? 'disabled' : ''}>&#9660;</button>
      <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">X</button>
    </div>
  \`).join('');
}

function addClaudeCodeFallback() {
  const body = document.getElementById('claudeCodeFallbacks');
  const empty = body.querySelector('div:not(.alias-row)');
  if (empty) empty.remove();
  const count = body.querySelectorAll('.alias-row').length;
  const row = document.createElement('div');
  row.className = 'alias-row fallback-model-row';
  row.innerHTML = \`
    <span style="color: #8b949e; font-size: 12px; min-width: 20px;">\${count + 1}.</span>
    <input data-cc-fallback placeholder="model name">
    <button class="btn btn-sm" onclick="moveClaudeCodeFallback(this, -1)" \${count === 0 ? 'disabled' : ''}>&#9650;</button>
    <button class="btn btn-sm" onclick="moveClaudeCodeFallback(this, 1)" disabled>&#9660;</button>
    <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">X</button>
  \`;
  body.appendChild(row);
}

function moveClaudeCodeFallback(btn, dir) {
  const row = btn.parentElement;
  const container = row.parentElement;
  const rows = Array.from(container.querySelectorAll('.alias-row'));
  const idx = rows.indexOf(row);
  const target = idx + dir;
  if (target < 0 || target >= rows.length) return;
  if (dir === -1) container.insertBefore(row, rows[target]);
  else container.insertBefore(row, rows[target].nextSibling);
  const updated = Array.from(container.querySelectorAll('.alias-row'));
  updated.forEach((r, i) => {
    const span = r.querySelector('span');
    if (span) span.textContent = (i + 1) + '.';
    const upBtn = r.querySelectorAll('.btn')[0];
    const downBtn = r.querySelectorAll('.btn')[1];
    if (upBtn) upBtn.disabled = i === 0;
    if (downBtn) downBtn.disabled = i === updated.length - 1;
  });
}

async function saveClaudeCode() {
  const fallbacks = [];
  document.querySelectorAll('[data-cc-fallback]').forEach(input => {
    const val = input.value.trim();
    if (val) fallbacks.push(val);
  });
  await adminFetch('/admin/api/claude-code', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: document.getElementById('claudeCodeEnabled').checked,
      target: document.getElementById('claudeCodeTarget').value,
      fallbacks,
    }),
  });
  toast('Claude Code settings saved');
  await loadConfig();
}

async function openAddKey() {
  document.getElementById('newKey').value = '';
  
  const listContainer = document.getElementById('keyModelSelectorList');
  listContainer.innerHTML = '<div style="color: #8b949e; font-size: 12px; padding: 4px;">Loading models...</div>';
  document.getElementById('keyModelSearch').value = '';
  document.getElementById('keyModal').classList.add('active');

  try {
    const res = await adminFetch('/admin/api/models');
    const data = await res.json();
    const models = data.models || [];
    
    if (models.length === 0) {
      listContainer.innerHTML = '<div style="color: #8b949e; font-size: 12px; padding: 4px;">No models available.</div>';
      return;
    }
    
    models.sort((a, b) => a.id.localeCompare(b.id));
    
    listContainer.innerHTML = models.map(m => \`
      <div class="key-model-select-item" data-model-id="\${m.id}" style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; padding: 2px 4px; border-radius: 4px;">
        <input type="checkbox" id="key-chk-\${m.id}" value="\${m.id}" style="width: auto; margin: 0; cursor: pointer;">
        <label for="key-chk-\${m.id}" style="display: inline; font-size: 13px; color: #c9d1d9; cursor: pointer; user-select: none;">
          \${m.id} <span style="font-size: 10px; color: #8b949e;">(\${m.owned_by || m.source})</span>
        </label>
      </div>
    \`).join('');
  } catch (err) {
    listContainer.innerHTML = '<div style="color: #da3633; font-size: 12px; padding: 4px;">Error loading models</div>';
  }
}

function filterKeyModelSelectorList() {
  const q = document.getElementById('keyModelSearch').value.toLowerCase();
  const items = document.querySelectorAll('.key-model-select-item');
  items.forEach(item => {
    const modelId = item.getAttribute('data-model-id').toLowerCase();
    item.style.display = modelId.includes(q) ? 'flex' : 'none';
  });
}

function selectAllKeyModels(select) {
  const q = document.getElementById('keyModelSearch').value.toLowerCase();
  const items = document.querySelectorAll('.key-model-select-item');
  items.forEach(item => {
    const modelId = item.getAttribute('data-model-id').toLowerCase();
    if (!q || modelId.includes(q)) {
      const cb = item.querySelector('input[type="checkbox"]');
      cb.checked = select;
    }
  });
}

async function addKey() {
  const key = document.getElementById('newKey').value.trim();
  if (!key) return;

  const checkedBoxes = document.querySelectorAll('#keyModelSelectorList input[type="checkbox"]:checked');
  const allowedModels = Array.from(checkedBoxes).map(cb => cb.value);

  await adminFetch('/admin/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, allowedModels }),
  });
  closeModal('keyModal');
  toast('Key added');
  await loadConfig();
}

async function deleteKey(key) {
  if (!confirm('Delete this key?')) return;
  await adminFetch(\`/admin/api/keys/\${encodeURIComponent(key)}\`, { method: 'DELETE' });
  toast('Key deleted');
  await loadConfig();
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

document.getElementById('provType').addEventListener('change', function() {
  document.getElementById('provAccountIdGroup').style.display = this.value === 'cloudflare' ? 'block' : 'none';
  if (!editingProvider) {
    loadNewProviderModelSelector(this.value);
  }
});

async function fetchAndRenderLogs() {
  try {
    const res = await adminFetch('/admin/api/logs');
    const data = await res.json();
    allLogs = data.logs || [];
    renderLogs();
  } catch (err) {
    console.error('Error fetching logs:', err);
  }
}

function renderLogs() {
  const filterVal = document.getElementById('logFilter').value;
  const tbody = document.getElementById('logsTableBody');
  
  const filtered = filterVal 
    ? allLogs.filter(l => l.provider === filterVal) 
    : allLogs;
    
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No logs available</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(l => {
    const date = new Date(l.timestamp);
    const timeStr = date.toLocaleTimeString() + '.' + String(date.getMilliseconds()).padStart(3, '0');

    const status = l.statusCode ?? l.status ?? 0;
    const latency = l.latencyMs ?? l.latency ?? 0;

    let statusClass = '';
    if (status >= 200 && status < 300) statusClass = 'color: #3fb950;';
    else if (status >= 400 && status < 500) statusClass = 'color: #d29922;';
    else if (status >= 500) statusClass = 'color: #da3633;';

    const pType = l.providerType || 'unknown';
    const pDisplay = l.providerNickname || l.provider;

    return \`
      <tr>
        <td style="color: #8b949e; font-family: monospace;">\${timeStr}</td>
        <td><span class="tag tag-\${pType}" style="font-size: 11px;">\${pDisplay}</span></td>
        <td style="font-family: monospace; color: #c9d1d9;">\${l.model}</td>
        <td style="color: #8b949e;">\${latency}ms</td>
        <td style="\${statusClass} font-weight: bold;">\${status || '-'}</td>
        <td style="color: #8b949e;">\${l.retryCount !== undefined ? l.retryCount : '-'}</td>
      </tr>
    \`;
  }).join('');
}

async function clearAllLogs() {
  if (!confirm('Clear all logs?')) return;
  await adminFetch('/admin/api/logs/clear', { method: 'DELETE' });
  allLogs = [];
  renderLogs();
  toast('Logs cleared');
}

</script>
</body>
</html>
`;

export const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>jcXproxy Admin — Login</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e1e4e8; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
.login-box { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 32px; width: 380px; text-align: center; }
.login-box h2 { font-size: 18px; margin-bottom: 8px; }
.login-box p { font-size: 13px; color: #8b949e; margin-bottom: 20px; }
.login-box input { width: 100%; padding: 10px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; font-size: 14px; margin-bottom: 12px; text-align: center; }
.login-box input:focus { outline: none; border-color: #58a6ff; }
.btn { width: 100%; padding: 8px 14px; border-radius: 6px; border: 1px solid #238636; background: #238636; color: #fff; cursor: pointer; font-size: 13px; }
.btn:hover { background: #2ea043; }
.login-error { color: #da3633; font-size: 12px; margin-bottom: 12px; display: none; }
</style>
</head>
<body>
<div class="login-box">
  <h2>jcXproxy Admin</h2>
  <p>Enter your admin key to continue.</p>
  <div class="login-error" id="loginError">Invalid admin key</div>
  <input id="adminKeyInput" type="password" placeholder="Admin key" autofocus>
  <button class="btn" onclick="doLogin()">Login</button>
</div>
<script>
async function doLogin() {
  var key = document.getElementById('adminKeyInput').value.trim();
  if (!key) return;
  try {
    var res = await fetch('/admin/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey: key })
    });
    if (res.status === 401) {
      document.getElementById('loginError').style.display = 'block';
      document.getElementById('adminKeyInput').value = '';
      document.getElementById('adminKeyInput').focus();
      return;
    }
    window.location.href = '/admin';
  } catch {
    document.getElementById('loginError').textContent = 'Connection error';
    document.getElementById('loginError').style.display = 'block';
  }
}
document.getElementById('adminKeyInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') doLogin();
});
</script>
</body>
</html>
`;
