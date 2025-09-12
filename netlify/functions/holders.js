// Netlify Function: holders
// Returns top token accounts (approx holders) for a token mint using RPC getTokenLargestAccounts

exports.handler = async (event, context) => {
  const RPC = process.env.QUICKNODE_RPC_URL;

  async function rpc(method, params) {
    const body = { jsonrpc: "2.0", id: 1, method, params };
    const res = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`RPC error: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "RPC returned error");
    return json.result;
  }

  try {
    const { mint } = JSON.parse(event.body);
    if (!mint) return { statusCode: 400, body: JSON.stringify({ error: "Missing mint" }) };

    // Total supply
    const supplyRes = await rpc("getTokenSupply", [mint]);
    const supply = Number(supplyRes?.value?.uiAmount) || 0;

    // Largest accounts (token accounts, not owner wallets)
    const largest = await rpc("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
    const list = (largest?.value || []).map((x) => ({
      address: x.address,
      amount: Number(x.amount),
      decimals: x.decimals,
      uiAmount: Number(x.uiAmount),
    }));

    // Compute percent of supply (approx)
    const withPct = list.map((x) => ({
      ...x,
      percent: supply > 0 ? (x.uiAmount / supply) * 100 : 0,
    }));

    return { statusCode: 200, body: JSON.stringify({ holders: withPct.map(acc => ({ address: acc.address, balance: acc.uiAmount || 0 })) }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Failed to get holders" }) };
  }
};
