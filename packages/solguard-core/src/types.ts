/**
 * SOLGuard Protocol (TSV-1) Core Types
 * TokenSOLver Verification Standard v1
 */

export type Severity = 'low' | 'medium' | 'high';
export type Grade = 'red' | 'yellow' | 'green';

export interface RuleResult {
  id: string;
  severity: Severity;
  passed: boolean;
  details?: Record<string, unknown>;
}

export interface RuleSetResult {
  mint: string;
  ruleset_version: number;
  scored_at: string;
  rules: RuleResult[];
  score: number;
  grade: Grade;
  proofs: ProofBundle;
}

export interface ProofBundle {
  mintAuthorityTx?: string;
  lpLockTx?: string;
  pool?: string;
  holders_snapshot?: string;
  [key: string]: unknown;
}

export interface AttestationData {
  mint: string;
  ruleset_version: number;
  score_bps: number;
  grade: number; // 0=red, 1=yellow, 2=green
  proofs_hash: string;
  attested_by: string;
  attested_at: number;
  revoked: boolean;
}

export interface TokenMetrics {
  supply: number;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  holders: number;
  topHoldersPct: number;
}

export interface PoolMetrics {
  address: string;
  type: 'raydium' | 'orca' | 'other';
  baseToken: string;
  quoteToken: string;
  liquidity: number;
  volume24h: number;
  lpLocked: boolean;
  lpLockExpiry?: number;
}

export interface WalletRisk {
  address: string;
  riskScore: number;
  flags: string[];
  connections: string[];
}

export const RULE_IDS = [
  'R1', 'R2', 'R3', 'R4', 'R5', 'R6',
  'R7', 'R8', 'R9', 'R10', 'R11', 'R12'
] as const;

export type RuleId = typeof RULE_IDS[number];
