import { getAllProbeNames, getProbeState } from "./state.ts";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDuration(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function cardClass(
  state: { paused: boolean; activeRuns: { startedAt: number }[] },
  ok?: boolean,
): string {
  if (state.paused) return "card-paused";
  if (state.activeRuns.length > 0) return "card-running";
  if (ok === false) return "card-fail";
  return "";
}

function probeCard(name: string): string {
  const state = getProbeState(name);
  const latest = state.history[0];
  const isRunning = state.activeRuns.length > 0;
  let statusLabel: string;
  if (state.paused) {
    statusLabel = `<span class="badge badge-paused">PAUSED</span>`;
  } else if (latest == null) {
    statusLabel = ``;
  } else if (latest.result.ok) {
    statusLabel = `<span class="badge badge-ok">OK</span>`;
  } else {
    statusLabel = `<span class="badge badge-fail">FAILING</span>`;
  }

  const completedDots = state.history
    .slice()
    .reverse()
    .map((run) => {
      const status = run.result.ok ? "OK" : (run.result.message ?? "failed");
      return `<span class="dot ${run.result.ok ? "dot-ok" : "dot-fail"}" tabindex="0" role="button"
        data-tip-status="${escapeHtml(run.result.ok ? "OK" : "FAILED")}"
        data-tip-time="${escapeHtml(formatTimestamp(run.timestamp))}"
        data-tip-duration="${escapeHtml(formatDuration(run.result.durationMs))}"
        data-tip-msg="${run.result.ok ? "" : escapeHtml(status)}"
        data-tip-error-details="${run.result.errorDetails ? escapeHtml(run.result.errorDetails) : ""}"
        data-tip-probe-id="${run.result.probeId ? escapeHtml(run.result.probeId) : ""}"
      ></span>`;
    })
    .join("");

  const now = Date.now();
  const runningDots = state.activeRuns
    .map(
      (r) => `<span class="dot dot-running" tabindex="0" role="status"
        data-tip-status="IN PROGRESS"
        data-tip-time="${escapeHtml(formatTimestamp(r.startedAt))}"
        data-tip-duration="${escapeHtml(formatDuration(now - r.startedAt))} elapsed"
        data-tip-msg=""
      ></span>`,
    )
    .join("");

  const historyDots = completedDots + runningDots;
  const runningInfo = "";

  const lastRunInfo = latest
    ? `<div class="meta">Last run: <strong>${relativeTime(latest.timestamp)}</strong> · ${formatTimestamp(latest.timestamp)} · Duration: <strong>${formatDuration(latest.result.durationMs)}</strong> · Ingress: <strong>${latest.result.ingressStatusCode}</strong></div>`
    : `<div class="meta">No runs recorded yet.</div>`;

  const runBtn = `<form method="POST" action="/admin/run/${encodeURIComponent(name)}"><button class="btn btn-run">⚡ Run now</button></form>`;

  const pauseBtn = state.paused
    ? `<form method="POST" action="/admin/resume/${encodeURIComponent(name)}"><button class="btn btn-resume">▶ Resume</button></form>`
    : `<form method="POST" action="/admin/pause/${encodeURIComponent(name)}"><button class="btn btn-pause">⏸ Pause</button></form>`;

  const failMsg =
    latest && !latest.result.ok && !state.paused
      ? `<div class="fail-msg">⚠ ${latest.result.message ?? "unknown error"}</div>${
          latest.result.errorDetails
            ? `<pre class="error-details">${escapeHtml(latest.result.errorDetails)}</pre>`
            : ""
        }`
      : "";

  const totalHistory = state.history.length;

  return `
  <div id="card-${name}" class="card ${cardClass(state, latest?.result.ok)}">
    <div class="card-header">
      <div class="card-title">
        <code>${name}</code>
        <span id="badge-${name}">${statusLabel}</span>
      </div>
      <div class="card-actions">${runBtn}${pauseBtn}</div>
    </div>
    <div id="fail-msg-${name}">${failMsg}</div>
    <div id="last-run-${name}">${lastRunInfo}</div>
    <div class="history-label">Last ${totalHistory} runs:</div>
    <div id="history-dots-${name}" class="history-dots">${historyDots || '<span class="meta">—</span>'}</div>
  </div>`;
}

export function renderStateJson(): string {
  const names = getAllProbeNames();
  const out: Record<string, unknown> = {};
  const now = Date.now();
  for (const name of names) {
    const state = getProbeState(name);
    const latest = state.history[0] ?? null;
    out[name] = {
      paused: state.paused,
      running: state.activeRuns.length > 0,
      activeRuns: state.activeRuns.map((r) => ({ startedAt: r.startedAt })),
      now,
      history: state.history.map((run) => ({
        timestamp: run.timestamp,
        ok: run.result.ok,
        message: run.result.message ?? null,
        errorDetails: run.result.errorDetails ?? null,
        probeId: run.result.probeId ?? null,
        durationMs: run.result.durationMs,
        ingressStatusCode: run.result.ingressStatusCode,
      })),
      latest: latest
        ? {
            timestamp: latest.timestamp,
            ok: latest.result.ok,
            message: latest.result.message ?? null,
            errorDetails: latest.result.errorDetails ?? null,
            probeId: latest.result.probeId ?? null,
            durationMs: latest.result.durationMs,
            ingressStatusCode: latest.result.ingressStatusCode,
          }
        : null,
    };
  }
  return JSON.stringify(out);
}

export function renderDashboard(): string {
  const names = getAllProbeNames();
  const cards =
    names.length > 0
      ? names.map(probeCard).join("\n")
      : `<p class="meta">No probes registered yet.</p>`;
  const runningCount = names.filter((n) => getProbeState(n).running).length;

  const sha = Deno.env.get("GIT_SHA") ?? "unknown";
  const shortSha = sha === "unknown" ? "unknown" : sha.slice(0, 7);
  const shaHtml =
    sha === "unknown"
      ? `<span>build unknown</span>`
      : `<a href="https://github.com/navikt/reops-health-probe/commit/${sha}" target="_blank" rel="noopener">${shortSha}</a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>reops-health-probe</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
    a { color: #63b3ed; text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    .header-row { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
    .subtitle { color: #718096; font-size: 0.875rem; }
    .running-pill { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; padding: 0.2rem 0.6rem; border-radius: 999px; color: #90cdf4; background: #1a365d; border: 1.5px solid #2b6cb0; }
    .running-pill.hidden { display: none; }
    nav { margin-bottom: 2rem; display: flex; gap: 1.5rem; font-size: 0.875rem; }
    .card { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 0.75rem; padding: 1.25rem 1.5rem; margin-bottom: 1rem; }
    .card-paused { border-color: #744210; background: #1a1a0e; }
    .card-fail { border-color: #742a2a; background: #1a0e0e; }
    .card-running { border-color: #2b6cb0; background: #0d1a2e; }
    .card-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem; }
    .card-actions { display: flex; gap: 0.5rem; align-items: center; }
    .card-title { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .card-title code { font-size: 1rem; font-weight: 600; background: #2d3748; padding: 0.2rem 0.5rem; border-radius: 0.25rem; }
    .badge { font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 0.25rem; letter-spacing: 0.05em; }
    .badge-ok { background: #1c4532; color: #68d391; }
    .badge-fail { background: #742a2a; color: #fc8181; }
    .badge-running { background: #1a365d; color: #90cdf4; border: 1.5px solid #2b6cb0; }
    .badge-paused { background: #744210; color: #f6ad55; }
    .badge-unknown { background: #2d3748; color: #a0aec0; }
    .meta { font-size: 0.8rem; color: #718096; margin-bottom: 0.5rem; }
    .fail-msg { font-size: 0.8rem; color: #fc8181; background: #2d1515; border-radius: 0.25rem; padding: 0.4rem 0.75rem; margin-bottom: 0.5rem; }
    .error-details { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.75rem; color: #feb2b2; background: #1a0a0a; border: 1px solid #742a2a; border-radius: 0.25rem; padding: 0.75rem; margin-bottom: 0.75rem; white-space: pre-wrap; word-break: break-all; overflow-x: auto; }
    .history-label { font-size: 0.7rem; color: #4a5568; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.4rem; }
    .history-dots { display: flex; gap: 3px; flex-wrap: wrap; }
    .dot { width: 10px; height: 10px; border-radius: 2px; cursor: pointer; position: relative; }
    .dot:focus { outline: 2px solid #63b3ed; outline-offset: 2px; }
    .dot-ok { background: #38a169; }
    .dot-fail { background: #e53e3e; }
    @property --worm-angle {
      syntax: "<angle>";
      initial-value: 0deg;
      inherits: false;
    }
    @keyframes worm { to { --worm-angle: 360deg; } }
    .dot-running {
      background: transparent;
      border: 1.5px solid transparent;
      background-image:
        linear-gradient(#1a1f2e, #1a1f2e),
        conic-gradient(from var(--worm-angle), transparent 0%, #718096 25%, transparent 50%);
      background-origin: border-box;
      background-clip: padding-box, border-box;
      animation: worm 1.2s linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .dot-running { animation: none; border-color: #4a5568; background-image: none; }
      .badge-running, .running-pill { animation: none; border-color: #2b6cb0; background-image: none; background-color: #1a365d; }
    }
    .dot-popover {
      display: none;
      position: absolute;
      background: #1a1f2e;
      border: 1px solid #4a5568;
      border-radius: 0.5rem;
      padding: 0.6rem 0.85rem;
      font-size: 0.75rem;
      color: #e2e8f0;
      white-space: normal;
      width: 600px;
      max-height: 340px;
      overflow-y: auto;
      pointer-events: auto;
      z-index: 100;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      line-height: 1.5;
    }
    .dot-popover.is-visible { display: block; }
    .dot-popover-status { font-weight: 700; font-size: 0.7rem; letter-spacing: 0.06em; margin-bottom: 0.35rem; }
    .dot-popover-status.ok { color: #68d391; }
    .dot-popover-status.fail { color: #fc8181; }
    .dot-popover-status.running { color: #a0aec0; }
    .dot-popover-row { display: flex; justify-content: space-between; gap: 0.75rem; color: #a0aec0; }
    .dot-popover-row span:last-child { color: #e2e8f0; text-align: right; }
    .dot-popover-msg { margin-top: 0.4rem; color: #fc8181; font-size: 0.7rem; word-break: break-word; }
    .dot-popover-probe-id { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.65rem; color: #a0aec0; word-break: break-all; }
    .dot-popover-details { margin-top: 0.5rem; font-family: "SF Mono", "Fira Code", monospace; font-size: 0.68rem; color: #feb2b2; background: #1a0a0a; border: 1px solid #742a2a; border-radius: 0.25rem; padding: 0.5rem; white-space: pre-wrap; word-break: break-all; }
    .btn { border: none; border-radius: 0.375rem; padding: 0.35rem 0.85rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
    .btn-run { background: #1a3a5c; color: #63b3ed; }
    .btn-run:hover { background: #2a5a8c; }
    .btn-pause { background: #744210; color: #f6ad55; }
    .btn-pause:hover { background: #975a16; }
    .btn-resume { background: #1c4532; color: #68d391; }
    .btn-resume:hover { background: #276749; }
    .refresh-note { font-size: 0.75rem; color: #4a5568; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>reops-health-probe</h1>
  <div class="header-row">
    <p class="subtitle">Pipeline health monitor</p>
    <span id="running-count" class="running-pill${runningCount > 0 ? "" : " hidden"}">${runningCount} running</span>
  </div>
  <nav>
    <a href="/">Dashboard</a>
    <a href="/metrics">Metrics</a>
    <a href="/docs">Grafana docs</a>
  </nav>
  ${cards}
  <p class="refresh-note"> build ${shaHtml}</p>
  <div id="tooltip" class="dot-popover" role="tooltip"></div>
  <script type="module">
    import { computePosition, flip, shift, offset } from 'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.6/+esm';

    // ── Tooltip ────────────────────────────────────────────────────────────────

    const tooltip = document.getElementById('tooltip');
    let pinned = null;
    let hovered = null;

    function position(dot) {
      const status = dot.dataset.tipStatus ?? '';
      const time = dot.dataset.tipTime ?? '';
      const duration = dot.dataset.tipDuration ?? '';
      const msg = dot.dataset.tipMsg ?? '';
      const errorDetails = dot.dataset.tipErrorDetails ?? '';
      const statusCls = status === 'OK' ? 'ok' : status === 'IN PROGRESS' ? 'running' : 'fail';
      const msgHtml = msg ? \`<div class="dot-popover-msg">\${msg}</div>\` : '';
      const detailsHtml = errorDetails ? \`<pre class="dot-popover-details">\${errorDetails}</pre>\` : '';
      tooltip.innerHTML = \`
        <div class="dot-popover-status \${statusCls}">\${status}</div>
        <div class="dot-popover-row"><span>Time</span><span>\${time}</span></div>
        <div class="dot-popover-row"><span>Duration</span><span>\${duration || '—'}</span></div>
        \${msgHtml}\${detailsHtml}
      \`.trim();
      tooltip.classList.add('is-visible');
      computePosition(dot, tooltip, {
        placement: 'top',
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        Object.assign(tooltip.style, { left: x + 'px', top: y + 'px', position: 'absolute' });
      });
    }

    function hideTooltip() {
      pinned = null;
      hovered = null;
      tooltip.classList.remove('is-visible');
    }

    function bindDot(dot) {
      dot.addEventListener('mouseenter', () => { hovered = dot; if (!pinned) position(dot); });
      dot.addEventListener('mouseleave', () => { hovered = null; if (!pinned) tooltip.classList.remove('is-visible'); });
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pinned === dot) { hideTooltip(); } else { pinned = dot; position(dot); }
      });
    }

    document.querySelectorAll('.dot[data-tip-status]').forEach(bindDot);
    document.addEventListener('click', () => hideTooltip());
    tooltip.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTooltip(); });

    // ── Live state polling ─────────────────────────────────────────────────────

    function fmt(ms) {
      if (ms === 0) return '—';
      if (ms < 1000) return ms + 'ms';
      return (ms / 1000).toFixed(1) + 's';
    }
    function fmtTs(ts) {
      return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }
    function relTime(ts, now) {
      const diff = Math.floor((now - ts) / 1000);
      if (diff < 60) return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    }

    function makeDot(run) {
      const s = document.createElement('span');
      s.className = 'dot ' + (run.ok ? 'dot-ok' : 'dot-fail');
      s.tabIndex = 0;
      s.setAttribute('role', 'button');
      s.dataset.tipStatus = run.ok ? 'OK' : 'FAILED';
      s.dataset.tipTime = fmtTs(run.timestamp);
      s.dataset.tipDuration = fmt(run.durationMs);
      s.dataset.tipMsg = run.ok ? '' : (run.message ?? '');
      s.dataset.tipErrorDetails = run.ok ? '' : (run.errorDetails ?? '');
      s.dataset.tipProbeId = run.probeId ?? '';
      bindDot(s);
      return s;
    }

    function makeRunningDot(runStartedAt, now) {
      const s = document.createElement('span');
      s.className = 'dot dot-running';
      s.tabIndex = 0;
      s.setAttribute('role', 'status');
      s.dataset.tipStatus = 'IN PROGRESS';
      s.dataset.tipTime = fmtTs(runStartedAt);
      s.dataset.tipDuration = fmt(now - runStartedAt) + ' elapsed';
      s.dataset.tipMsg = '';
      bindDot(s);
      return s;
    }

    async function poll() {
      let data;
      try {
        const res = await fetch('/api/state');
        if (!res.ok) return;
        data = await res.json();
      } catch { return; }

      for (const [name, probe] of Object.entries(data)) {
        const now = probe.now;
        const card = document.getElementById('card-' + name);
        if (!card) continue;

        // card border/bg class
        let cardCls = '';
        if (probe.paused) cardCls = 'card-paused';
        else if (probe.running) cardCls = 'card-running';
        else if (probe.latest && !probe.latest.ok) cardCls = 'card-fail';
        card.className = 'card' + (cardCls ? ' ' + cardCls : '');

        // badge
        const badge = document.getElementById('badge-' + name);
        if (badge) {
          let html;
          if (probe.paused) html = '<span class="badge badge-paused">PAUSED</span>';
          else if (!probe.latest) html = '';
          else if (probe.latest.ok) html = '<span class="badge badge-ok">OK</span>';
          else html = '<span class="badge badge-fail">FAILING</span>';
          badge.innerHTML = html;
        }

        // fail msg
        const failEl = document.getElementById('fail-msg-' + name);
        if (failEl) {
          if (probe.latest && !probe.latest.ok && !probe.paused) {
            const msg = probe.latest.message ?? 'unknown error';
            const det = probe.latest.errorDetails ? \`<pre class="error-details">\${probe.latest.errorDetails.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>\` : '';
            failEl.innerHTML = \`<div class="fail-msg">⚠ \${msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>\${det}\`;
          } else {
            failEl.innerHTML = '';
          }
        }

        // last run meta
        const lastRunEl = document.getElementById('last-run-' + name);
        if (lastRunEl) {
          if (probe.latest) {
            const r = probe.latest;
            lastRunEl.innerHTML = \`<div class="meta">Last run: <strong>\${relTime(r.timestamp, now)}</strong> · \${fmtTs(r.timestamp)} · Duration: <strong>\${fmt(r.durationMs)}</strong> · Ingress: <strong>\${r.ingressStatusCode}</strong></div>\`;
          } else {
            lastRunEl.innerHTML = '<div class="meta">No runs recorded yet.</div>';
          }
        }

        // dots — two independent regions: [completed... | running...]
        // Running dots are never detached (would reset CSS animation).
        // Completed section is rebuilt only when history changes.
        const dotsEl = document.getElementById('history-dots-' + name);
        if (dotsEl) {
          const activeRuns = probe.activeRuns ?? [];

          // ── Running dots (tail) — patch in-place, add/remove as count changes ──
          const existingRunning = [...dotsEl.querySelectorAll('.dot-running')];
          for (let i = 0; i < activeRuns.length; i++) {
            if (existingRunning[i]) {
              existingRunning[i].dataset.tipDuration = fmt(now - activeRuns[i].startedAt) + ' elapsed';
            } else {
              dotsEl.appendChild(makeRunningDot(activeRuns[i].startedAt, now));
            }
          }
          for (let i = activeRuns.length; i < existingRunning.length; i++) {
            existingRunning[i].remove();
          }

          // ── Completed dots (head) — rebuild only when history changes ──
          const historyKey = probe.history.length + ':' + (probe.history[0]?.timestamp ?? 0);
          if (dotsEl.dataset.historyKey !== historyKey) {
            dotsEl.dataset.historyKey = historyKey;
            const pinnedIdx = pinned ? [...dotsEl.querySelectorAll('.dot')].indexOf(pinned) : -1;
            dotsEl.querySelectorAll('.dot:not(.dot-running)').forEach(d => d.remove());
            const firstRunning = dotsEl.querySelector('.dot-running');
            if (probe.history.length === 0 && activeRuns.length === 0) {
              dotsEl.replaceChildren(Object.assign(document.createElement('span'), { className: 'meta', textContent: '—' }));
            } else {
              dotsEl.querySelector('.meta')?.remove();
              for (const d of [...probe.history].reverse().map(makeDot)) {
                dotsEl.insertBefore(d, firstRunning);
              }
            }
            const newAllDots = [...dotsEl.querySelectorAll('.dot')];
            if (pinnedIdx !== -1) {
              pinned = newAllDots[pinnedIdx] ?? null;
              if (pinned) position(pinned); else hideTooltip();
            }
          }
        }
      }

      // running count pill
      const pill = document.getElementById('running-count');
      if (pill) {
        const n = Object.values(data).reduce((sum, p) => sum + (p.activeRuns?.length ?? 0), 0);
        pill.textContent = n + ' running';
        pill.classList.toggle('hidden', n === 0);
      }
    }

    // ── Live popover ticker ────────────────────────────────────────────────────
    // Refreshes the open popover every second so elapsed time stays current.
    // Only recomputes — no fetch needed.
    setInterval(() => {
      const dot = pinned ?? hovered;
      if (!dot || !tooltip.classList.contains('is-visible')) return;
      if (dot.dataset.tipStatus !== 'IN PROGRESS') return;
      const startedAt = new Date(dot.dataset.tipTime).getTime();
      dot.dataset.tipDuration = fmt(Date.now() - startedAt) + ' elapsed';
      position(dot);
    }, 1_000);

    poll();
    setInterval(poll, 2_000);
  </script>
</body>
</html>`;
}

export function renderDocs(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Grafana docs — reops-health-probe</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; padding: 2rem; max-width: 860px; }
    a { color: #63b3ed; text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; font-weight: 600; margin: 2rem 0 0.75rem; color: #a0aec0; border-bottom: 1px solid #2d3748; padding-bottom: 0.4rem; }
    h3 { font-size: 0.95rem; font-weight: 600; margin: 1.25rem 0 0.4rem; }
    .subtitle { color: #718096; font-size: 0.875rem; margin-bottom: 2rem; }
    nav { margin-bottom: 2rem; display: flex; gap: 1.5rem; font-size: 0.875rem; }
    p { font-size: 0.9rem; line-height: 1.6; color: #cbd5e0; margin-bottom: 0.75rem; }
    ul { padding-left: 1.25rem; margin-bottom: 0.75rem; }
    li { font-size: 0.9rem; line-height: 1.8; color: #cbd5e0; }
    pre { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 0.5rem; padding: 1rem 1.25rem; overflow-x: auto; margin-bottom: 1rem; }
    code { font-family: "SF Mono", "Fira Code", monospace; font-size: 0.82rem; color: #e2e8f0; }
    p code, li code { background: #2d3748; padding: 0.1rem 0.35rem; border-radius: 0.2rem; font-size: 0.82rem; }
    .tip { background: #1a2a1a; border-left: 3px solid #38a169; padding: 0.75rem 1rem; border-radius: 0 0.375rem 0.375rem 0; margin-bottom: 1rem; font-size: 0.875rem; color: #9ae6b4; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 1rem; }
    th { text-align: left; padding: 0.5rem 0.75rem; background: #1a1f2e; color: #a0aec0; font-weight: 600; border-bottom: 1px solid #2d3748; }
    td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1a1f2e; color: #cbd5e0; }
    td code { background: #2d3748; padding: 0.1rem 0.35rem; border-radius: 0.2rem; }
  </style>
</head>
<body>
  <h1>Grafana dashboard setup</h1>
  <p class="subtitle">How to add reops-health-probe metrics to your Grafana dashboard</p>
  <nav>
    <a href="/">Dashboard</a>
    <a href="/metrics">Metrics</a>
    <a href="/docs">Grafana docs</a>
  </nav>

  <h2>Available metrics</h2>
  <p>All metrics are exposed at <code>/metrics</code> in Prometheus text format. Each metric has a <code>probe</code> label.</p>
  <table>
    <tr><th>Metric</th><th>Type</th><th>Description</th></tr>
    <tr><td><code>probe_success</code></td><td>gauge</td><td><code>1</code> = last run OK, <code>0</code> = failed</td></tr>
    <tr><td><code>probe_duration_seconds</code></td><td>gauge</td><td>Duration of last probe run</td></tr>
    <tr><td><code>probe_ingress_status_code</code></td><td>gauge</td><td>HTTP status from ingress on last run</td></tr>
    <tr><td><code>probe_last_run_timestamp_seconds</code></td><td>gauge</td><td>Unix timestamp of last run</td></tr>
  </table>

  <h2>1. Add Prometheus data source</h2>
  <p>In Grafana → <strong>Connections → Data sources → Add data source → Prometheus</strong>.</p>
  <p>Set the URL to where this service is reachable, e.g. <code>http://reops-health-probe:9091</code> (in-cluster) or your ingress URL.</p>

  <h2>2. Useful PromQL queries</h2>

  <h3>Probe up/down status</h3>
  <pre><code>probe_success{probe="innblikk-pipeline"}</code></pre>
  <p>Use a <strong>Stat</strong> panel with thresholds: <code>0</code> = red, <code>1</code> = green.</p>

  <h3>All probes status table</h3>
  <pre><code>probe_success</code></pre>
  <p>Use a <strong>Table</strong> or <strong>Status history</strong> panel.</p>

  <h3>Probe duration over time</h3>
  <pre><code>probe_duration_seconds{probe="innblikk-pipeline"}</code></pre>
  <p>Use a <strong>Time series</strong> panel. Duration includes the wait time for the pipeline to process the event.</p>

  <h3>Time since last successful run</h3>
  <pre><code>(time() - probe_last_run_timestamp_seconds) / 60</code></pre>
  <p>Returns minutes since last run. Useful for detecting a stalled probe.</p>

  <h3>Alert rule: probe failing</h3>
  <pre><code>probe_success{probe="innblikk-pipeline"} == 0</code></pre>
  <p>Set <strong>pending period</strong> to <code>0</code> (fire immediately) or <code>5m</code> to avoid flapping alerts.</p>

  <h2>3. Example dashboard JSON (minimal)</h2>
  <p>Import this into Grafana (<strong>Dashboards → Import → Paste JSON</strong>):</p>
  <pre><code>{
  "title": "reops-health-probe",
  "panels": [
    {
      "type": "stat",
      "title": "innblikk-pipeline",
      "targets": [{ "expr": "probe_success{probe=\\"innblikk-pipeline\\"}" }],
      "fieldConfig": {
        "defaults": {
          "mappings": [{ "type": "value", "options": { "0": { "text": "FAILING", "color": "red" }, "1": { "text": "OK", "color": "green" } } }]
        }
      }
    },
    {
      "type": "timeseries",
      "title": "Probe duration",
      "targets": [{ "expr": "probe_duration_seconds" }]
    }
  ]
}</code></pre>

  <div class="tip">
    Tip: The probe runs every 12 minutes and the pipeline has a ~10 minute processing window, so expect <code>probe_duration_seconds</code> to be around 600–700s on a healthy run.
  </div>

  <h2>4. Adding a new probe</h2>
  <p>See <a href="https://github.com/navikt/reops-health-probe" target="_blank">README</a> for the full guide. Summary:</p>
  <ul>
    <li>Create <code>src/probes/&lt;name&gt;.ts</code> exporting a <code>Probe</code> object</li>
    <li>Register it in <code>src/main.ts</code> with <code>Deno.cron</code> + <code>registerProbe</code></li>
    <li>It will appear automatically on the dashboard and in metrics</li>
  </ul>
</body>
</html>`;
}
