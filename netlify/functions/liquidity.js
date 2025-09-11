// Netlify Function: liquidity
// Fetch Dexscreener pairs for a Solana token mint

export const config = { path: "/liquidity" };

const BASE = process.env.DEXSCREENER_BASE || "https://api.dexscreener.com/latest/dex/tokens";

export default async (req) => {
  try {
    const { mint } = await req.json();
    if (!mint) return new Response(JSON.stringify({ error: "Missing mint" }), { status: 400 });

    const url = `${BASE}/${mint}`;
    const res = await fetch(url, { headers: { "User-Agent": "tokensolver/1.0" } });
    if (!res.ok) throw new Error(`Dexscreener error ${res.status}`);
    const json = await res.json();
    return Response.json(json);
  } catch (err) {
    return new Response(err.message || "Failed to fetch liquidity", { status: 500 });
  }
};
