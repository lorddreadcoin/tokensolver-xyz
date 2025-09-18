const API_BASE = '/.netlify/functions';

const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');

async function api(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function setError(msg) {
  const el = $('error');
  el.textContent = msg;
  show('error');
}

function clearError() {
  $('error').textContent = '';
  hide('error');
}

function renderScore(score) {
  $('score-value').textContent = `${score.score} / 100`;
  
  // Render basic reasons
  const reasons = score.reasons
    .map(r => `• ${r.label}: ${r.value} (impact ${r.impact})`) 
    .join('\n');
  $('score-reasons').innerHTML = `<pre class="json">${reasons}</pre>`;
  
  // Render progressive intelligence signals if available
  if (score.signals && score.signals.length > 0) {
    renderProgressiveSignals(score.signals);
  }
  
  show('score-card');
}

function renderProgressiveSignals(signals) {
  const signalsContainer = document.getElementById('signals-container') || createSignalsContainer();
  
  // Group signals by tier for progressive disclosure
  const signalsByTier = signals.reduce((acc, signal) => {
    acc[signal.tier] = acc[signal.tier] || [];
    acc[signal.tier].push(signal);
    return acc;
  }, {});

  const tierColors = {
    'RED': '#ff4444',
    'ORANGE': '#ff8800', 
    'YELLOW': '#ffaa00',
    'GREEN': '#44ff44'
  };

  let signalsHTML = '<div class="signals-section"><h4>🔍 Intelligence Signals</h4>';
  
  Object.entries(signalsByTier).forEach(([tier, tierSignals]) => {
    const color = tierColors[tier] || '#888';
    signalsHTML += `
      <div class="signal-tier" style="border-left: 4px solid ${color}; margin: 8px 0; padding: 8px;">
        <div class="tier-header" style="color: ${color}; font-weight: bold; margin-bottom: 4px;">
          ${tier} TIER (${tierSignals.length})
        </div>
        ${tierSignals.map(signal => `
          <div class="signal-item" style="margin: 4px 0; padding: 4px 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
            <div style="font-weight: bold;">${signal.type}</div>
            <div style="font-size: 0.9em; opacity: 0.9;">${signal.reason}</div>
            <div style="font-size: 0.8em; opacity: 0.7;">Confidence: ${(signal.confidence * 100).toFixed(0)}%</div>
          </div>
        `).join('')}
      </div>
    `;
  });
  
  signalsHTML += '</div>';
  signalsContainer.innerHTML = signalsHTML;
}

function createSignalsContainer() {
  const container = document.createElement('div');
  container.id = 'signals-container';
  container.className = 'signals-container';
  
  // Insert after score reasons
  const scoreCard = document.getElementById('score-card');
  const scoreReasons = document.getElementById('score-reasons');
  scoreCard.insertBefore(container, scoreReasons.nextSibling);
  
  return container;
}

function renderHolders(data) {
  const tbody = $('holders-body');
  tbody.innerHTML = '';
  data.slice(0, 10).forEach((h, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td><code>${h.address}</code></td><td>${h.uiAmount}</td><td>${(h.percent||0).toFixed(2)}%</td>`;
    tbody.appendChild(tr);
  });
  show('holders');
}

function renderLiquidity(info) {
  const el = $('liquidity-body');
  if (!info || !info.pairs || !info.pairs.length) {
    el.textContent = 'No pairs found on Dexscreener.';
  } else {
    const top = info.pairs[0];
    el.innerHTML = `
      <div><b>Pair</b>: ${top.chainId || 'solana'} • ${top.dexId || ''}</div>
      <div><b>Liquidity (USD)</b>: ${top.liquidity && top.liquidity.usd ? top.liquidity.usd.toLocaleString() : '—'}</div>
      <div><b>FDV</b>: ${top.fdv ? top.fdv.toLocaleString() : '—'}</div>
      <div><b>Price</b>: ${top.priceUsd ? `$${Number(top.priceUsd).toFixed(6)}` : '—'}</div>
    `;
  }
  show('liquidity');
}

function renderChart(mint) {
  const url = `https://dexscreener.com/solana/${mint}?embed=1&theme=dark`;
  const iframe = $('dexscreener-embed');
  iframe.src = url;
  iframe.style.height = '600px';
  iframe.style.width = '100%';
  show('chart');
}

function renderBubbles(data) {
  const container = document.getElementById('bubbles');
  
  if (!data.nodes || data.nodes.length === 0) {
    container.innerHTML = '<div class="card">No bubble map data available</div>';
    return;
  }
  
  // Create interactive bubble visualization
  container.innerHTML = `
    <div class="card">
      <h3>Interactive Bubble Map</h3>
      <div id="bubble-viz" style="width: 100%; height: 400px; background: #1a1a2e; border-radius: 8px; position: relative;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #888;">
          🔄 Loading interactive visualization...
        </div>
      </div>
      <details style="margin-top: 10px;">
        <summary>Raw Data (${data.nodes.length} nodes, ${data.links.length} links)</summary>
        <pre style="max-height: 200px; overflow-y: auto;">${JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  `;
  
  // Initialize D3.js visualization
  setTimeout(() => initBubbleVisualization(data), 100);
}

function initBubbleVisualization(data) {
  const container = document.getElementById('bubble-viz');
  if (!container || !window.d3) {
    // Fallback if D3.js not loaded
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #888;">
        <div>📊 Interactive visualization requires D3.js</div>
        <div style="margin-top: 10px; font-size: 0.9em;">
          Showing ${data.nodes.length} holders with ${data.links.length} connections
        </div>
      </div>
    `;
    return;
  }
  
  // D3.js bubble visualization will be implemented here
  container.innerHTML = `
    <div style="padding: 20px; text-align: center; color: #888;">
      <div>🎯 Bubble visualization coming soon</div>
      <div style="margin-top: 10px; font-size: 0.9em;">
        ${data.nodes.length} nodes • ${data.links.length} connections
      </div>
    </div>
  `;
}

async function loadAIAnalysis(address, type, data) {
  try {
    const aiResult = await api('ai-agent', { address, type, data });
    renderAIAnalysis(aiResult);
  } catch (err) {
    console.error('AI Analysis failed:', err);
    renderAIAnalysis({ 
      message: "🤖 AI Analysis unavailable", 
      analysis: "Manual analysis required - check the data above for insights.",
      risk_level: "unknown"
    });
  }
}

function renderAIAnalysis(data) {
  const container = document.getElementById('ai-analysis') || createAIAnalysisSection();
  const riskColor = data.risk_level === 'high' ? '#ff4444' : 
                   data.risk_level === 'medium' ? '#ffaa00' : 
                   data.risk_level === 'low' ? '#44ff44' : '#888';
  
  container.innerHTML = `
    <div class="card">
      <h3>🤖 AI Agent Analysis</h3>
      <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin: 10px 0;">
        <div style="color: ${riskColor}; font-weight: bold; margin-bottom: 10px;">
          Risk Level: ${data.risk_level?.toUpperCase() || 'UNKNOWN'}
        </div>
        <div style="line-height: 1.6; white-space: pre-wrap;">${data.analysis}</div>
        ${data.model_used ? `<div style="opacity: 0.7; font-size: 0.8em; margin-top: 10px;">Powered by ${data.model_used}</div>` : ''}
      </div>
    </div>
  `;
}

function createAIAnalysisSection() {
  const section = document.createElement('div');
  section.id = 'ai-analysis';
  section.className = 'section';
  
  // Insert after the summary section
  const summarySection = document.getElementById('summary');
  summarySection.parentNode.insertBefore(section, summarySection.nextSibling);
  
  return section;
}

$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  hide('score-card');
  hide('holders');
  hide('liquidity');
  hide('chart');
  hide('bubbles');

  const address = $('address').value.trim();
  if (!address) return;

  try {
    const { type, normalizedAddress } = await api('resolve', { address });
    show('result');
    $('summary').innerHTML = `<div class="card"><b>Type:</b> ${type} • <b>Address:</b> <code>${normalizedAddress}</code></div>`;

    if (type === 'token') {
      const [holders, liq, score, bubbles] = await Promise.all([
        api('holders', { mint: normalizedAddress }).catch(() => []),
        api('liquidity', { mint: normalizedAddress }).catch(() => ({})),
        api('score', { kind: 'token', address: normalizedAddress }).catch(() => ({ score: 0, reasons: [] })),
        api('bubbles', { mint: normalizedAddress }).catch(() => ({ nodes: [], links: [] }))
      ]);
      const resultsEl = document.getElementById('results');
      const typeInfoEl = document.getElementById('type-info');
      if (resultsEl) resultsEl.style.display = 'block';
      if (typeInfoEl) typeInfoEl.textContent = `Type: ${type} • Address: ${address}`;
      renderScore(score);
      renderHolders(holders);
      renderLiquidity(liq);
      renderChart(normalizedAddress);
      renderBubbles(bubbles);
      
      // Load AI analysis for token
      loadAIAnalysis(normalizedAddress, type, { holders, liquidity: liq, score, bubbles });
    } else {
      const score = await api('score', { kind: 'wallet', address: normalizedAddress });
      const resultsEl = document.getElementById('results');
      const typeInfoEl = document.getElementById('type-info');
      if (resultsEl) resultsEl.style.display = 'block';
      if (typeInfoEl) typeInfoEl.textContent = `Type: ${type} • Address: ${address}`;
      renderScore(score);
      
      // Load AI analysis for wallet
      loadAIAnalysis(normalizedAddress, type, { score });
    }
  } catch (err) {
    console.error(err);
    setError(err.message || 'Failed to analyze.');
  }
});
