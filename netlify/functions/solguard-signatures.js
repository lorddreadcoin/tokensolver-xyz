// SOLGuard anomaly signatures (lightweight, high-signal)
// Each detector returns an array of structured signals: { tier, type, severity, confidence, reason, evidence }

function pct(n) { return `${(n * 100).toFixed(2)}%`; }

// Wallet-level signals
function detectWalletSignals(metrics) {
  const signals = [];
  const nowSec = Math.floor(Date.now() / 1000);
  const {
    txCount = 0,
    failedCount = 0,
    uniqueInteractions = 0,
    balanceSOL = 0,
    firstBlockTime = null,
    lastBlockTime = null,
    txTimes = [] // array of unix seconds (optional)
  } = metrics || {};

  // Derived
  const failedRate = txCount > 0 ? failedCount / txCount : 0;
  const accountAgeDays = firstBlockTime ? Math.max(0, Math.floor((nowSec - firstBlockTime) / 86400)) : null;

  // 24h activity burst
  const dayAgo = nowSec - 86400;
  const tx24h = Array.isArray(txTimes) ? txTimes.filter(t => t && t >= dayAgo).length : 0;

  // RED: Very new wallet + high burst activity
  if (accountAgeDays !== null && accountAgeDays < 7 && tx24h >= 50) {
    signals.push({
      tier: 'RED', type: 'NEW_WALLET_BURST', severity: 'high', confidence: 0.85,
      reason: 'Very new wallet exhibiting bursty high-frequency activity in last 24h',
      evidence: { accountAgeDays, tx24h }
    });
  }

  // ORANGE: High failure rate under load
  if (failedRate >= 0.25 && tx24h >= 20) {
    signals.push({
      tier: 'ORANGE', type: 'HIGH_FAILURE_RATE', severity: 'high', confidence: 0.8,
      reason: `Elevated transaction failure rate under activity (${pct(failedRate)})`,
      evidence: { txCount, failedCount, tx24h }
    });
  }

  // YELLOW: Low interaction diversity with many txs (possible automation)
  if (txCount >= 30 && uniqueInteractions < 5) {
    signals.push({
      tier: 'YELLOW', type: 'LOW_DIVERSITY_AUTOMATION', severity: 'medium', confidence: 0.7,
      reason: 'Many transactions but very few counterparties (automation pattern)',
      evidence: { txCount, uniqueInteractions }
    });
  }

  // GREEN: Maintains healthy balance over zero with regular activity
  if (balanceSOL > 1 && txCount >= 10 && failedRate < 0.05) {
    signals.push({
      tier: 'GREEN', type: 'HEALTHY_ACTIVITY', severity: 'low', confidence: 0.6,
      reason: 'Healthy on-chain activity with low failure rate and positive balance',
      evidence: { balanceSOL, txCount, failedRate: pct(failedRate) }
    });
  }

  return signals;
}

// Token-level signals (uses concentration and liquidity ratio inputs computed upstream)
function detectTokenSignals(metrics, thresholds) {
  const signals = [];
  const {
    top5Pct = null, // 0..100 numeric percent
    liquidityRatio = null // 0..1
  } = metrics || {};

  const thr = thresholds || {};

  if (typeof top5Pct === 'number') {
    if (top5Pct > (thr.holder_concentration_bad || 0.5) * 100) {
      signals.push({
        tier: 'RED', type: 'EXTREME_CONCENTRATION', severity: 'high', confidence: 0.9,
        reason: `Top 5 holders control ${top5Pct.toFixed(2)}% of supply`,
        evidence: { top5Pct }
      });
    } else if (top5Pct > (thr.holder_concentration_warn || 0.25) * 100) {
      signals.push({
        tier: 'ORANGE', type: 'HIGH_CONCENTRATION', severity: 'medium', confidence: 0.8,
        reason: `Elevated holder concentration at ${top5Pct.toFixed(2)}%`,
        evidence: { top5Pct }
      });
    }
  }

  if (typeof liquidityRatio === 'number') {
    if (liquidityRatio < (thr.liquidity_ratio_low || 0.05)) {
      signals.push({
        tier: 'RED', type: 'LOW_LIQUIDITY_RATIO', severity: 'high', confidence: 0.85,
        reason: `Liquidity ratio ${(liquidityRatio * 100).toFixed(2)}% is critically low`,
        evidence: { liquidityRatio }
      });
    } else if (liquidityRatio < (thr.liquidity_ratio_mid || 0.10)) {
      signals.push({
        tier: 'ORANGE', type: 'WEAK_LIQUIDITY_RATIO', severity: 'medium', confidence: 0.75,
        reason: `Liquidity ratio ${(liquidityRatio * 100).toFixed(2)}% is weak`,
        evidence: { liquidityRatio }
      });
    }
  }

  return signals;
}

module.exports = {
  detectWalletSignals,
  detectTokenSignals,
};
