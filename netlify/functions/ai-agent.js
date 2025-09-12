// Netlify Function: ai-agent
// AI-powered on-chain analysis using OpenRouter/ChatGPT for expert insights

exports.handler = async (event, context) => {
  try {
    const { address, type, data } = JSON.parse(event.body);
    if (!address) return { statusCode: 400, body: JSON.stringify({ error: "Missing address" }) };

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENROUTER_API_KEY && !OPENAI_API_KEY) {
      return { statusCode: 200, body: JSON.stringify({ 
        message: "🤖 AI Agent unavailable - API key not configured",
        analysis: "Manual analysis required",
        risk_level: "unknown"
      }) };
    }

    // Prepare context for AI analysis
    const context = {
      address,
      type: type || "unknown",
      timestamp: new Date().toISOString(),
      data: data || {}
    };

    // Create analysis prompt based on data type
    let prompt = "";
    if (type === "token") {
      prompt = `Analyze this Solana token for investment risks and opportunities:

Address: ${address}
Type: Token Mint
Holders Data: ${JSON.stringify(data.holders || {}, null, 2)}
Liquidity Data: ${JSON.stringify(data.liquidity || {}, null, 2)}
Score Data: ${JSON.stringify(data.score || {}, null, 2)}

Provide a concise analysis covering:
1. Risk Assessment (High/Medium/Low)
2. Key Red Flags or Green Flags
3. Holder Distribution Analysis
4. Liquidity Health
5. Overall Recommendation (Buy/Hold/Avoid)

Keep response under 200 words, use emojis, be direct and actionable.`;
    } else {
      prompt = `Analyze this Solana wallet for security and behavioral patterns:

Address: ${address}
Type: Wallet
Transaction Data: ${JSON.stringify(data.score || {}, null, 2)}

Provide a concise analysis covering:
1. Security Risk Level (High/Medium/Low)
2. Behavioral Patterns
3. Red Flags or Legitimacy Indicators
4. Transaction History Insights
5. Trust Score Assessment

Keep response under 200 words, use emojis, be direct and actionable.`;
    }

    // Try OpenRouter first, fallback to OpenAI
    let apiResponse;
    try {
      if (OPENROUTER_API_KEY) {
        apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://tokensolver.netlify.app',
            'X-Title': 'TokenSOLver AI Agent'
          },
          body: JSON.stringify({
            model: 'anthropic/claude-3.5-sonnet',
            messages: [
              {
                role: 'system',
                content: 'You are a Solana blockchain expert and DeFi security analyst. Provide concise, actionable insights about on-chain data.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 300,
            temperature: 0.7
          })
        });
      } else if (OPENAI_API_KEY) {
        apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content: 'You are a Solana blockchain expert and DeFi security analyst. Provide concise, actionable insights about on-chain data.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: 300,
            temperature: 0.7
          })
        });
      }

      if (!apiResponse.ok) {
        throw new Error(`AI API error: ${apiResponse.status}`);
      }

      const aiData = await apiResponse.json();
      const analysis = aiData.choices?.[0]?.message?.content || "Analysis unavailable";

      // Extract risk level from analysis
      const riskLevel = analysis.toLowerCase().includes('high risk') ? 'high' :
                       analysis.toLowerCase().includes('medium risk') ? 'medium' :
                       analysis.toLowerCase().includes('low risk') ? 'low' : 'unknown';

      return { statusCode: 200, body: JSON.stringify({
        message: "🤖 AI Analysis Complete",
        analysis,
        risk_level: riskLevel,
        timestamp: new Date().toISOString(),
        model_used: OPENROUTER_API_KEY ? 'claude-3.5-sonnet' : 'gpt-4'
      }) };

    } catch (aiError) {
      // Fallback analysis based on available data
      let fallbackAnalysis = "🤖 AI analysis temporarily unavailable. ";
      
      if (type === "token" && data.score) {
        const score = data.score.score || 0;
        if (score < 30) {
          fallbackAnalysis += "⚠️ LOW SCORE detected. High risk token - proceed with extreme caution.";
        } else if (score > 70) {
          fallbackAnalysis += "✅ HIGH SCORE detected. Token shows positive indicators.";
        } else {
          fallbackAnalysis += "⚡ MEDIUM SCORE. Standard due diligence recommended.";
        }
      }

      return { statusCode: 200, body: JSON.stringify({
        message: "🤖 Fallback Analysis",
        analysis: fallbackAnalysis,
        risk_level: "unknown",
        error: "AI service unavailable"
      }) };
    }

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ 
      error: err.message || "AI agent failed",
      message: "🤖 Analysis failed - please try again"
    }) };
  }
};
