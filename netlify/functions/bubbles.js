// Netlify Function: bubbles
// Generate bubble map data (nodes/links) for token transfer visualization

const RPC = process.env.QUICKNODE_RPC_URL;

async function rpc(method, params) {
  const body = { jsonrpc: "2.0", id: 1, method, params };
  const res = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`RPC error: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "RPC returned error");
  return json.result;
}

exports.handler = async (event, context) => {
  try {
    const { mint } = JSON.parse(event.body);
    if (!mint) return { statusCode: 400, body: JSON.stringify({ error: "Missing mint" }) };

    // Get top token accounts (holders)
    const largest = await rpc("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
    const accounts = (largest?.value || []).slice(0, 10);

    // Create nodes from top holders
    const nodes = accounts.map((acc, i) => ({
      id: acc.address,
      label: `Holder ${i + 1}`,
      balance: Number(acc.uiAmount || 0),
      size: Math.max(10, Math.min(50, (acc.uiAmount || 0) / 1000)), // Visual size
      group: i < 3 ? "whale" : "holder" // Top 3 are whales
    }));

    // Add the token mint as central node
    nodes.unshift({
      id: mint,
      label: "Token Mint",
      balance: 0,
      size: 60,
      group: "mint"
    });

    // Create links from mint to all holders (simplified)
    const links = accounts.map(acc => ({
      source: mint,
      target: acc.address,
      value: Number(acc.uiAmount || 0),
      type: "holds"
    }));

    // For a more sophisticated bubble map, we'd need to:
    // 1. Get transaction signatures for each holder
    // 2. Parse transfer instructions to find inter-holder transfers
    // 3. Create links between holders based on transfer history
    // This is a simplified version for MVP

    return { statusCode: 200, body: JSON.stringify({
      nodes,
      links,
      metadata: {
        totalNodes: nodes.length,
        totalLinks: links.length,
        mint,
        generated: new Date().toISOString()
      }
    }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Failed to generate bubble map" }) };
  }
};
