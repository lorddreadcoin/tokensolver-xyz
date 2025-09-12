const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/.netlify/functions';

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
  const reasons = score.reasons
    .map(r => `• ${r.label}: ${r.value} (impact ${r.impact})`) 
    .join('\n');
  $('score-reasons').innerHTML = `<pre class="json">${reasons}</pre>`;
  show('score-card');
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

function renderBubbles(graph) {
  $('bubbles-json').textContent = JSON.stringify(graph, null, 2);
  show('bubbles');
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
      renderScore(score);
      renderHolders(holders);
      renderLiquidity(liq);
      renderChart(normalizedAddress);
      renderBubbles(bubbles);
    } else {
      const score = await api('score', { kind: 'wallet', address: normalizedAddress });
      renderScore(score);
    }
  } catch (err) {
    console.error(err);
    setError(err.message || 'Failed to analyze.');
  }
});
