// Netlify Function: score
// Compute a basic SOLGuard score for wallet or token using simple heuristics.
// This is an MVP you can iterate on. Returns { score: 0-100, reasons: [...] }

exports.handler = async (event, context) => {
  const RPC = process.env.QUICKNODE_RPC_URL;

  async function rpc(method, params) {
    const body = { jsonrpc: "2.0", id: 1, method, params };
    const res = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`RPC error: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "RPC returned error");
    return json.result;
  if (json.error) throw new Error(json.error.message || "RPC returned error");
  return json.result;
}

async function scoreWallet(address) {
  const reasons = [];
  let score = 50; // start neutral

  // Heuristic 1: activity age via first signature
  try {
    const sigs = await rpc("getSignaturesForAddress", [address, { limit: 1, before: undefined }]);
    if (Array.isArray(sigs) && sigs.length) {
      // We only have recent by default; bump score minimally for any activity
      score += 5;
      reasons.push({ label: "Has activity", value: sigs[0].signature, impact: +5 });
    } else {
      score -= 5;
      reasons.push({ label: "No visible activity", value: 0, impact: -5 });
    }
  } catch {
    reasons.push({ label: "Activity check failed", value: "n/a", impact: 0 });
  }

  // Heuristic 2: balance check
  try {
    const balanceRes = await rpc("getBalance", [address, { commitment: "confirmed" }]);
    const lamports = Number(balanceRes?.value || 0);
    if (lamports > 0) {
      score += 5;
      reasons.push({ label: "Has SOL balance", value: lamports, impact: +5 });
    } else {
      reasons.push({ label: "Zero SOL balance", value: lamports, impact: 0 });
    }
  } catch {
    reasons.push({ label: "Balance check failed", value: "n/a", impact: 0 });
  }

  // Clamp and return
  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

async function scoreToken(mint) {
  const reasons = [];
  let score = 50;

  // Heuristic 1: supply
  try {
    const supplyRes = await rpc("getTokenSupply", [mint]);
    const supply = Number(supplyRes?.value?.uiAmount || 0);
    if (supply > 0) {
      score += 10;
      reasons.push({ label: "Token supply positive", value: supply, impact: +10 });
    } else {
      score -= 10;
      reasons.push({ label: "No supply", value: supply, impact: -10 });
    }
  } catch {
    reasons.push({ label: "Supply check failed", value: "n/a", impact: 0 });
  }

  // Heuristic 2: holder concentration (approx via largest accounts)
  try {
    const largest = await rpc("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
    const list = (largest?.value || []).slice(0, 5);
    const topSum = list.reduce((acc, x) => acc + Number(x.uiAmount || 0), 0);
    const total = Number((await rpc("getTokenSupply", [mint]))?.value?.uiAmount || 0);
    const pct = total > 0 ? (topSum / total) * 100 : 0;
    if (pct > 50) {
      score -= 15;
      reasons.push({ label: "High holder concentration (top 5)", value: `${pct.toFixed(2)}%`, impact: -15 });
    } else {
      score += 5;
      reasons.push({ label: "Acceptable concentration", value: `${pct.toFixed(2)}%`, impact: +5 });
    }
  } catch {
    reasons.push({ label: "Concentration check failed", value: "n/a", impact: 0 });
  }

  // Clamp and return
  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

async function scoreToken(mint) {
  const reasons = [];
  let score = 50;

  // Heuristic 1: supply
  try {
    const supplyRes = await rpc("getTokenSupply", [mint]);
    const supply = Number(supplyRes?.value?.uiAmount || 0);
    if (supply > 0) {
      score += 10;
      reasons.push({ label: "Token supply positive", value: supply, impact: +10 });
    } else {
      score -= 10;
      reasons.push({ label: "No supply", value: supply, impact: -10 });
    }
  } catch {
    reasons.push({ label: "Supply check failed", value: "n/a", impact: 0 });
  }

  // Heuristic 2: holder concentration (approx via largest accounts)
  try {
    const largest = await rpc("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
    const list = (largest?.value || []).slice(0, 5);
    const topSum = list.reduce((acc, x) => acc + Number(x.uiAmount || 0), 0);
    const total = Number((await rpc("getTokenSupply", [mint]))?.value?.uiAmount || 0);
    const pct = total > 0 ? (topSum / total) * 100 : 0;
    if (pct > 50) {
      score -= 15;
      reasons.push({ label: "High holder concentration (top 5)", value: `${pct.toFixed(2)}%`, impact: -15 });
    } else {
      score += 5;
      reasons.push({ label: "Acceptable concentration", value: `${pct.toFixed(2)}%`, impact: +5 });
    }
  } catch {
    reasons.push({ label: "Concentration check failed", value: "n/a", impact: 0 });
  }

  // Clamp and return
  score = Math.max(0, Math.min(100, score));
  return { score, reasons };
}

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
