// Netlify Function: score
// Compute a basic SOLGuard score for wallet or token using simple heuristics.
// This is an MVP you can iterate on. Returns { score: 0-100, reasons: [...] }

exports.handler = async (event, context) => {
  const RPC = process.env.QUICKNODE_RPC_URL;
  const DEX_BASE = process.env.DEXSCREENER_BASE; // e.g., https://api.dexscreener.com/latest/dex/tokens
  const params = require('./solguard-params');
  const signatures = require('./solguard-signatures');

  async function rpc(method, params) {
    const body = { jsonrpc: "2.0", id: 1, method, params };
    const res = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`RPC error: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "RPC returned error");
    return json.result;
  }

async function scoreWallet(address) {
  // Enhanced SOLGuard wallet scoring based on solana-universal-analytics parameters
  // Weights mirrored from EnhancedWalletScoring (Python)
  const weights = params.walletWeights;

  const reasons = [];

  // Fetch recent signatures (cap to keep RPC usage reasonable)
  let sigs = [];
  try {
    sigs = await rpc("getSignaturesForAddress", [address, { limit: 100 }]);
    if (!Array.isArray(sigs)) sigs = [];
  } catch (e) {
    reasons.push({ label: "Signature fetch failed", value: e?.message || "error", impact: 0 });
    sigs = [];
  }

  const txCount = sigs.length;
  const failedCount = sigs.filter(s => s && typeof s === 'object' && s.err).length;
  const times = sigs.map(s => s?.blockTime).filter(Boolean);
  const firstBlockTime = times.length ? Math.min(...times) : null;
  const lastBlockTime = times.length ? Math.max(...times) : null;

  // Unique interactions (counterparties) from recent transactions (up to 20 to limit RPC)
  let uniqueInteractions = 0;
  try {
    const sample = sigs.slice(0, 20);
    const accSet = new Set();
    for (const s of sample) {
      try {
        const tx = await rpc("getTransaction", [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
        const keys = tx?.transaction?.message?.accountKeys || [];
        for (const k of keys) {
          const keyStr = typeof k === 'string' ? k : k?.pubkey;
          if (keyStr && keyStr !== address) accSet.add(keyStr);
        }
        // Also include pre/post token balance owners if present
        const owners = [
          ...(tx?.meta?.preTokenBalances || []).map(b => b?.owner).filter(Boolean),
          ...(tx?.meta?.postTokenBalances || []).map(b => b?.owner).filter(Boolean),
        ];
        for (const ow of owners) if (ow && ow !== address) accSet.add(ow);
      } catch {}
    }
    uniqueInteractions = accSet.size;
  } catch {}

  // Balance (in SOL)
  let lamports = 0;
  try {
    const balanceRes = await rpc("getBalance", [address, { commitment: "confirmed" }]);
    lamports = Number(balanceRes?.value || 0);
  } catch {}
  const balanceSOL = lamports / 1e9;

  // Component scoring functions (mirroring Python logic where possible)
  function scoreAccountAge(firstTsSec) {
    if (!firstTsSec) return { name: "Account age", value: -20 };
    const days = Math.max(0, Math.floor((Date.now() / 1000 - firstTsSec) / 86400));
    if (days >= 365) return { name: `Mature account (${days} days)`, value: 20 };
    if (days >= 90) return { name: `Established account (${days} days)`, value: 10 };
    if (days >= 30) return { name: `Moderate age (${days} days)`, value: 0 };
    if (days >= 7) return { name: `New account (${days} days)`, value: -10 };
    return { name: `Very new account (${days} days)`, value: -20 };
  }

  function scoreVolume(balanceSol, txCnt) {
    if (txCnt === 0) return { name: "No transaction activity", value: -15 };
    if (balanceSol > 10 && txCnt > 100) return { name: `High activity (${txCnt} txs)`, value: 15 };
    if (balanceSol > 1 && txCnt > 10) return { name: `Active wallet (${txCnt} txs)`, value: 8 };
    if (txCnt > 1) return { name: "Moderate activity", value: 0 };
    return { name: "Low transaction volume", value: -8 };
  }

  function scoreConsistency(txCnt) {
    if (txCnt === 0) return { name: "No txs", value: 0 };
    if (txCnt >= 100) return { name: `High tx count (${txCnt})`, value: 10 };
    if (txCnt >= 50) return { name: `Good tx activity (${txCnt})`, value: 5 };
    if (txCnt >= 10) return { name: "Some activity", value: 0 };
    return { name: `Low tx count (${txCnt})`, value: -5 };
  }

  function scoreStability(balanceSol, hasActivity) {
    if (!hasActivity && balanceSol === 0) return { name: "Empty wallet no activity", value: -10 };
    if (balanceSol > 0) return { name: "Maintains positive balance", value: 4 };
    return { name: "Zero or negative balance", value: -5 };
  }

  function scoreDiversity(uniquePeers, txCnt) {
    if (txCnt === 0) return { name: "No txs", value: 0 };
    if (uniquePeers >= 20) return { name: `High diversity (${uniquePeers} peers)`, value: 8 };
    if (uniquePeers >= 10) return { name: `Good diversity (${uniquePeers} peers)`, value: 4 };
    if (uniquePeers >= 5) return { name: "Some diversity", value: 0 };
    return { name: `Low diversity (${uniquePeers} peers)`, value: -4 };
  }

  function scoreFailures(failed, total) {
    if (total === 0) return { name: "No txs", value: 0 };
    const rate = (failed / Math.max(total, 1)) * 100;
    if (rate === 0) return { name: "Perfect success rate", value: 5 };
    if (rate < 5) return { name: `Low failure (${rate.toFixed(1)}%)`, value: 2 };
    if (rate < 10) return { name: "Moderate failure", value: 0 };
    if (rate < 25) return { name: `High failure (${rate.toFixed(1)}%)`, value: -3 };
    return { name: `Very high failure (${rate.toFixed(1)}%)`, value: -5 };
  }

  const comp_age = scoreAccountAge(firstBlockTime);
  const comp_vol = scoreVolume(balanceSOL, txCount);
  const comp_con = scoreConsistency(txCount);
  const comp_stb = scoreStability(balanceSOL, txCount > 0);
  const comp_div = scoreDiversity(uniqueInteractions, txCount);
  const comp_fail = scoreFailures(failedCount, txCount);

  const weighted = {
    account_age: comp_age.value * weights.account_age,
    transaction_volume: comp_vol.value * weights.transaction_volume,
    transaction_consistency: comp_con.value * weights.transaction_consistency,
    balance_stability: comp_stb.value * weights.balance_stability,
    interaction_diversity: comp_div.value * weights.interaction_diversity,
    failure_rate: comp_fail.value * weights.failure_rate,
  };

  let score = 50 + weighted.account_age + weighted.transaction_volume + weighted.transaction_consistency + weighted.balance_stability + weighted.interaction_diversity + weighted.failure_rate - 0; // base centered at 50
  score = Math.max(0, Math.min(100, score));

  // Reasons with weighted impacts
  reasons.push(
    { label: "Account age", value: comp_age.name, impact: Number(weighted.account_age.toFixed(2)) },
    { label: "Transaction volume", value: comp_vol.name, impact: Number(weighted.transaction_volume.toFixed(2)) },
    { label: "Consistency", value: comp_con.name, impact: Number(weighted.transaction_consistency.toFixed(2)) },
    { label: "Balance stability", value: comp_stb.name, impact: Number(weighted.balance_stability.toFixed(2)) },
    { label: "Interaction diversity", value: comp_div.name, impact: Number(weighted.interaction_diversity.toFixed(2)) },
    { label: "Failure rate", value: comp_fail.name, impact: Number(weighted.failure_rate.toFixed(2)) },
    { label: "Snapshot", value: { txCount, failedCount, uniqueInteractions, balanceSOL: Number(balanceSOL.toFixed(4)) }, impact: 0 }
  );

  // Build wallet signals
  const walletSignals = signatures.detectWalletSignals({
    txCount,
    failedCount,
    uniqueInteractions,
    balanceSOL,
    firstBlockTime,
    lastBlockTime,
    txTimes: times,
  });

  return { score, reasons, signals: walletSignals };
}

async function scoreToken(mint) {
  const reasons = [];
  const tWeights = params.tokenWeights;
  const tThresh = params.tokenThresholds;

  // Components initialize
  let comp_supply = { name: "Supply check failed", value: 0 };
  let comp_conc = { name: "Concentration check failed", value: 0 };
  let comp_liquidity = { name: "Liquidity ratio unavailable", value: 0 };

  // Component 1: Supply presence
  try {
    const supplyRes = await rpc("getTokenSupply", [mint]);
    const supply = Number(supplyRes?.value?.uiAmount || 0);
    if (supply >= tThresh.min_supply) {
      comp_supply = { name: `Token supply positive (${supply})`, value: 10 };
    } else {
      comp_supply = { name: `No/zero supply (${supply})`, value: -10 };
    }
  } catch {}

  // Component 2: Holder concentration (top 5)
  try {
    const largest = await rpc("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
    const list = (largest?.value || []).slice(0, 5);
    const topSum = list.reduce((acc, x) => acc + Number(x.uiAmount || 0), 0);
    const total = Number((await rpc("getTokenSupply", [mint]))?.value?.uiAmount || 0);
    const pct = total > 0 ? (topSum / total) * 100 : 0;
    if (pct > tThresh.holder_concentration_bad * 100) {
      comp_conc = { name: `High concentration top5 ${pct.toFixed(2)}%`, value: -15 };
    } else if (pct > tThresh.holder_concentration_warn * 100) {
      comp_conc = { name: `Moderate concentration ${pct.toFixed(2)}%`, value: -5 };
    } else {
      comp_conc = { name: `Acceptable concentration ${pct.toFixed(2)}%`, value: 5 };
    }
    var top5Pct = pct; // expose for signals
  } catch {}

  // Component 3: Liquidity ratio (Dexscreener)
  let liquidityRatio = null;
  if (DEX_BASE) {
    try {
      const url = `${DEX_BASE}/${mint}`;
      const res = await fetch(url, { headers: { "User-Agent": "tokensolver/1.0" } });
      if (res.ok) {
        const json = await res.json();
        const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
        if (pairs.length) {
          // Choose best pair by liquidityUsd
          const best = pairs.reduce((a, b) => (Number(a?.liquidity?.usd || 0) > Number(b?.liquidity?.usd || 0) ? a : b));
          const liq = Number(best?.liquidity?.usd || 0);
          const fdv = Number(best?.fdv || best?.fullyDilutedValuation || best?.marketCap || 0);
          let ratio = 0;
          if (fdv > 0) ratio = liq / fdv;
          else if (Number(best?.marketCap || 0) > 0) ratio = liq / Number(best.marketCap);

          if (ratio > 0) {
            if (ratio < tThresh.liquidity_ratio_low) {
              comp_liquidity = { name: `Low liquidity ratio ${(ratio * 100).toFixed(2)}%`, value: -12 };
            } else if (ratio < tThresh.liquidity_ratio_mid) {
              comp_liquidity = { name: `Moderate liquidity ${(ratio * 100).toFixed(2)}%`, value: -6 };
            } else {
              comp_liquidity = { name: `Healthy liquidity ${(ratio * 100).toFixed(2)}%`, value: 8 };
            }
            liquidityRatio = ratio;
          } else {
            comp_liquidity = { name: "Liquidity data present, ratio = 0", value: -6 };
          }
        }
      }
    } catch {}
  }

  // Weighted combine into final score
  const weighted = {
    supply_presence: comp_supply.value * (tWeights.supply_presence || 0),
    holder_concentration: comp_conc.value * (tWeights.holder_concentration || 0),
    liquidity_ratio: comp_liquidity.value * (tWeights.liquidity_ratio || 0),
  };

  let score = 50 + weighted.supply_presence + weighted.holder_concentration + weighted.liquidity_ratio;
  score = Math.max(0, Math.min(100, score));

  reasons.push(
    { label: "Supply", value: comp_supply.name, impact: Number(weighted.supply_presence.toFixed(2)) },
    { label: "Concentration", value: comp_conc.name, impact: Number(weighted.holder_concentration.toFixed(2)) },
    { label: "Liquidity", value: comp_liquidity.name, impact: Number(weighted.liquidity_ratio.toFixed(2)) }
  );

  // Build token signals
  const tokenSignals = signatures.detectTokenSignals({
    top5Pct: typeof top5Pct === 'number' ? top5Pct : null,
    liquidityRatio: typeof liquidityRatio === 'number' ? liquidityRatio : null,
  }, tThresh);

  return { score, reasons, signals: tokenSignals };
}

// duplicate scoreToken removed (was defined twice)

  try {
    const { kind, address } = JSON.parse(event.body);
    if (!kind || !address) return { statusCode: 400, body: JSON.stringify({ error: "Missing kind or address" }) };

    if (kind === "wallet") {
      const result = await scoreWallet(address);
      return { statusCode: 200, body: JSON.stringify(result) };
    } else if (kind === "token") {
      const result = await scoreToken(address);
      return { statusCode: 200, body: JSON.stringify(result) };
    } else {
      return { statusCode: 400, body: JSON.stringify({ error: "Unknown kind" }) };
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Failed to score" }) };
  }
};
