// SOLGuard shared parameters (weights, thresholds)
// Centralized tuning for wallet and token scoring.

module.exports = {
  walletWeights: {
    account_age: 0.25,
    transaction_volume: 0.20,
    transaction_consistency: 0.15,
    balance_stability: 0.15,
    interaction_diversity: 0.15,
    failure_rate: 0.10,
  },
  // Token scoring thresholds are intentionally conservative; tune as we gather data.
  tokenThresholds: {
    holder_concentration_bad: 0.50,   // >50% top 5 is red flag
    holder_concentration_warn: 0.25,  // >25% caution

    // Liquidity ratio = liquidity_usd / fdv_usd
    // If FDV is missing, try liquidity/marketCap; if absent, skip this component.
    liquidity_ratio_low: 0.05,   // <5% very low
    liquidity_ratio_mid: 0.10,   // <10% mid concern

    // Supply checks
    min_supply: 1, // must be > 0 to be valid
  },
  tokenWeights: {
    supply_presence: 0.20,
    holder_concentration: 0.40,
    liquidity_ratio: 0.40,
  }
};
