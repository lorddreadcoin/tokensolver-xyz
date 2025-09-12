// Netlify Function: liquidity
// Fetch Dexscreener pairs for a Solana token mint

const BASE = process.env.DEXSCREENER_BASE;

exports.handler = async (event, context) => {
  try {
    const { mint } = JSON.parse(event.body);
    if (!mint) return { statusCode: 400, body: JSON.stringify({ error: "Missing mint" }) };

    const url = `${BASE}/${mint}`;
    const res = await fetch(url, { headers: { "User-Agent": "tokensolver/1.0" } });
    if (!res.ok) throw new Error(`Dexscreener error ${res.status}`);
    const json = await res.json();
    return { statusCode: 200, body: JSON.stringify({ pairs: json.pairs || [] }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "Failed to fetch liquidity" }) };
  }
};
