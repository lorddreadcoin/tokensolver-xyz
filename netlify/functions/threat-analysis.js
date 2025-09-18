// Netlify Function: threat-analysis
// Returns structured threat data for the visceral UX frontend
// Integrates with intelligence-engine.js to provide proper signal format

const { runComprehensiveAnalysis } = require('./intelligence-engine');

exports.handler = async (event, context) => {
  // CORS headers for frontend integration
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Parse request parameters
    const params = event.httpMethod === 'GET' 
      ? event.queryStringParameters 
      : JSON.parse(event.body || '{}');

    const { address, kind = 'token' } = params;

    if (!address) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Address parameter required',
          example: '?address=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&kind=token'
        })
      };
    }

    // Run comprehensive intelligence analysis
    console.log(`Starting threat analysis for ${kind}: ${address}`);
    const analysis = await runComprehensiveAnalysis(address, kind);

    // Transform analysis into frontend-expected format
    const threatData = transformToThreatFormat(analysis, address);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(threatData)
    };

  } catch (error) {
    console.error('Threat analysis failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Analysis failed',
        message: error.message,
        fallback: generateFallbackThreatData(params?.address)
      })
    };
  }
};

function transformToThreatFormat(analysis, address) {
  // Extract all signals from progressive phases
  const allSignals = [];
  
  if (analysis.phases) {
    Object.values(analysis.phases).forEach(phaseModules => {
      phaseModules.forEach(moduleResult => {
        if (moduleResult.signals && Array.isArray(moduleResult.signals)) {
          allSignals.push(...moduleResult.signals);
        }
      });
    });
  }

  // Calculate overall risk metrics
  const criticalSignals = allSignals.filter(s => s.severity === 'CRITICAL' || s.tier === 'RED');
  const highSignals = allSignals.filter(s => s.severity === 'HIGH' || s.tier === 'ORANGE');
  const mediumSignals = allSignals.filter(s => s.severity === 'MEDIUM' || s.tier === 'YELLOW');

  // Determine overall risk tier
  let riskTier = 'GREEN';
  if (criticalSignals.length > 0) riskTier = 'RED';
  else if (highSignals.length > 1) riskTier = 'RED';
  else if (highSignals.length > 0 || mediumSignals.length > 2) riskTier = 'ORANGE';
  else if (mediumSignals.length > 0) riskTier = 'YELLOW';

  // Calculate overall confidence (weighted average)
  const totalConfidence = allSignals.reduce((sum, signal) => {
    const confidence = signal.confidence || 0.5;
    const weight = signal.severity === 'CRITICAL' ? 3 : signal.severity === 'HIGH' ? 2 : 1;
    return sum + (confidence * weight);
  }, 0);

  const totalWeight = allSignals.reduce((sum, signal) => {
    return sum + (signal.severity === 'CRITICAL' ? 3 : signal.severity === 'HIGH' ? 2 : 1);
  }, 0);

  const overallConfidence = totalWeight > 0 ? totalConfidence / totalWeight : 0.5;

  // Calculate manipulation risk
  const manipulationIndicators = allSignals.filter(s => 
    s.type?.includes('MANIPULATION') || 
    s.type?.includes('PUMP') || 
    s.type?.includes('WHALE') ||
    s.reason?.toLowerCase().includes('manipulation') ||
    s.reason?.toLowerCase().includes('coordinated')
  );

  let manipulationRisk = 'NONE';
  if (manipulationIndicators.length > 2) manipulationRisk = 'HIGH';
  else if (manipulationIndicators.length > 0) manipulationRisk = 'MEDIUM';

  // Calculate numeric score for backward compatibility
  const score = Math.max(0, Math.min(100, 
    100 - (criticalSignals.length * 30) - (highSignals.length * 15) - (mediumSignals.length * 5)
  ));

  // Format signals with proper tiers
  const formattedSignals = allSignals.map(signal => ({
    type: signal.type || 'UNKNOWN_THREAT',
    tier: mapSeverityToTier(signal.severity || signal.tier),
    severity: signal.severity || mapTierToSeverity(signal.tier),
    confidence: signal.confidence || 0.5,
    reason: signal.reason || signal.evidence || 'Threat detected',
    evidence: signal.evidence || signal.reason,
    timestamp: signal.timestamp || Date.now(),
    module: signal.module || 'unknown'
  }));

  return {
    address,
    score,
    riskTier,
    manipulationRisk,
    signals: {
      signals: formattedSignals,
      riskTier,
      confidence: overallConfidence,
      criticalCount: criticalSignals.length,
      highCount: highSignals.length,
      mediumCount: mediumSignals.length,
      totalCount: allSignals.length
    },
    metadata: {
      analysisTimestamp: Date.now(),
      version: '2.0.0',
      engineVersion: analysis.metadata?.version || '1.0.0',
      modulesExecuted: analysis.metadata?.modulesExecuted || 0
    },
    // Legacy compatibility
    reasons: formattedSignals.map(s => ({
      label: s.type.replace(/_/g, ' '),
      value: s.reason,
      impact: s.tier === 'RED' ? 30 : s.tier === 'ORANGE' ? 15 : 5
    }))
  };
}

function mapSeverityToTier(severity) {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL': return 'RED';
    case 'HIGH': return 'ORANGE';
    case 'MEDIUM': return 'YELLOW';
    case 'LOW': return 'GREEN';
    default: return 'YELLOW';
  }
}

function mapTierToSeverity(tier) {
  switch (tier?.toUpperCase()) {
    case 'RED': return 'CRITICAL';
    case 'ORANGE': return 'HIGH';
    case 'YELLOW': return 'MEDIUM';
    case 'GREEN': return 'LOW';
    default: return 'MEDIUM';
  }
}

function generateFallbackThreatData(address) {
  // Fallback data when analysis fails
  return {
    address: address || 'unknown',
    score: 50,
    riskTier: 'YELLOW',
    manipulationRisk: 'NONE',
    signals: {
      signals: [{
        type: 'ANALYSIS_UNAVAILABLE',
        tier: 'YELLOW',
        severity: 'MEDIUM',
        confidence: 0.3,
        reason: 'Unable to complete full analysis. Please try again.',
        evidence: 'System temporarily unavailable',
        timestamp: Date.now(),
        module: 'fallback'
      }],
      riskTier: 'YELLOW',
      confidence: 0.3,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 1,
      totalCount: 1
    },
    metadata: {
      analysisTimestamp: Date.now(),
      version: '2.0.0',
      fallback: true
    },
    reasons: [{
      label: 'Analysis Unavailable',
      value: 'Unable to complete analysis',
      impact: 5
    }]
  };
}
