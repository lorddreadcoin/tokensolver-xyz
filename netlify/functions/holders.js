// Netlify Function: holders
// Returns top token accounts (approx holders) for a token mint using RPC getTokenLargestAccounts

export const config = { path: "/holders" };

const RPC = process.env.QUICKNODE_RPC_URL;

async function rpc(method, params) {
  const body = { jsonrpc: "2.0", id: 1, method, params };
  const res = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`RPC error: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "RPC returned error");
  return json.result;
}

export default async (req) => {
  try {
    const { mint } = await req.json();
    if (!mint) return new Response(JSON.stringify({ error: "Missing mint" }), { status: 400 });

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

    return Response.json(withPct);
  } catch (err) {
    return new Response(err.message || "Failed to get holders", { status: 500 });
  }
};
