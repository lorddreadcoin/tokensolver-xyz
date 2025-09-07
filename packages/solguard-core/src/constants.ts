/**
 * SOLGuard Protocol (TSV-1) Constants
 */

import { RuleId } from './types';

// Rule weights for scoring (must sum to 1.0)
export const RULE_WEIGHTS: Record<RuleId, number> = {
  R1: 0.15,  // Mint authority multisig (high)
  R2: 0.10,  // Freeze authority policy (high)
  R3: 0.10,  // Metadata & decimals valid (med)
  R4: 0.10,  // Supply cap vs declared (med)
  R5: 0.10,  // Verified pool online (med)
  R6: 0.15,  // LP time-lock present (high)
  R7: 0.05,  // Pool depth sane / not one-sided (med)
  R8: 0.10,  // No LP mint after lock (high)
  R9: 0.08,  // Top-holder threshold (med)
  R10: 0.03, // Whale map OK (low)
  R11: 0.02, // Program log anomalies (low)
  R12: 0.02, // Router anomalies (low)
};

// Grade thresholds
export const GRADE_THRESHOLDS = {
  GREEN: 0.85,
  YELLOW: 0.60,
} as const;

// Program ID for SOLGuard Registry
export const SOLGUARD_PROGRAM_ID = "SoLGuaRdREG1stry11111111111111111111111111111";

// Rule descriptions
export const RULE_DESCRIPTIONS: Record<RuleId, { name: string; description: string; severity: string }> = {
  R1: {
    name: "Mint Authority Multisig",
    description: "Token mint authority is controlled by a multisig wallet",
    severity: "high"
  },
  R2: {
    name: "Freeze Authority Policy", 
    description: "Freeze authority is either null or properly managed",
    severity: "high"
  },
  R3: {
    name: "Metadata & Decimals Valid",
    description: "Token metadata and decimal configuration is valid",
    severity: "medium"
  },
  R4: {
    name: "Supply Cap vs Declared",
    description: "Actual supply matches declared tokenomics",
    severity: "medium"
  },
  R5: {
    name: "Verified Pool Online",
    description: "Primary liquidity pool is verified and active",
    severity: "medium"
  },
  R6: {
    name: "LP Time-lock Present",
    description: "Liquidity provider tokens are time-locked",
    severity: "high"
  },
  R7: {
    name: "Pool Depth Sane",
    description: "Pool liquidity depth is balanced and reasonable",
    severity: "medium"
  },
  R8: {
    name: "No LP Mint After Lock",
    description: "No new LP tokens minted after initial lock",
    severity: "high"
  },
  R9: {
    name: "Top-holder Threshold",
    description: "Top holders don't exceed concentration limits",
    severity: "medium"
  },
  R10: {
    name: "Whale Map OK",
    description: "Large holder distribution is acceptable",
    severity: "low"
  },
  R11: {
    name: "Program Log Anomalies",
    description: "No suspicious program interaction patterns",
    severity: "low"
  },
  R12: {
    name: "Router Anomalies",
    description: "No unusual DEX router behavior detected",
    severity: "low"
  },
};
