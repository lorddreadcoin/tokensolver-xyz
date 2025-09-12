// Netlify Function: resolve
// Detect whether an input address is a token mint or a wallet address on Solana.

const RPC = process.env.QUICKNODE_RPC_URL;
const CLUSTER = process.env.SOLANA_CLUSTER;

async function getAccountInfo(address) {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getAccountInfo",
    params: [address, { encoding: "base64" }]
  };
  const res = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`RPC error: ${res.status}`);
  return res.json();
}

exports.handler = async (event, context) => {
  try {
    const { address } = await JSON.parse(event.body);
    if (!address) return { statusCode: 400, body: JSON.stringify({ error: "Missing address" }) };

    // Basic detection via getAccountInfo
    const info = await getAccountInfo(address);
    const acc = info?.result?.value;

    // If no account data, treat as wallet (could be system account without data)
    if (!acc) {
      return { statusCode: 200, body: JSON.stringify({ type: "wallet", normalizedAddress: address, cluster: CLUSTER }) };
    }

    const owner = acc?.owner; // program owner
    // SPL Token Program v2 id
    const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

    if (owner === TOKEN_PROGRAM) {
      // Token account or mint - quick heuristic: mints have data length 82
      const dataB64 = acc?.data?.[0];
      let isMint = false;
      if (dataB64) {
        const raw = Buffer.from(dataB64, "base64");
        // Mint account size is 82 bytes in SPL Token v2
        isMint = raw.length === 82;
      }
      return { statusCode: 200, body: JSON.stringify({ type: isMint ? "token" : "wallet", normalizedAddress: address, cluster: CLUSTER }) };
    }

    // Otherwise, assume wallet (system owned)
    return { statusCode: 200, body: JSON.stringify({ type: "wallet", normalizedAddress: address, cluster: CLUSTER }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Failed to resolve" }) };
  }
};
