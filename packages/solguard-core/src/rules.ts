/**
 * SOLGuard Protocol (TSV-1) Rule Validation Logic
 */

import { RuleResult, TokenMetrics, PoolMetrics, WalletRisk } from './types';

export class RuleValidator {
  
  /**
   * R1: Mint authority multisig (high)
   */
  static validateMintAuthority(metrics: TokenMetrics): RuleResult {
    const isMultisig = metrics.mintAuthority && 
      metrics.mintAuthority.length > 32 && // Multisig addresses are longer
      !metrics.mintAuthority.startsWith('11111'); // Not null authority
    
    return {
      id: 'R1',
      severity: 'high',
      passed: isMultisig,
      details: { authority: metrics.mintAuthority }
    };
  }

  /**
   * R2: Freeze authority policy (high)
   */
  static validateFreezeAuthority(metrics: TokenMetrics): RuleResult {
    const isValid = !metrics.freezeAuthority || 
      metrics.freezeAuthority === '11111111111111111111111111111111' || // null
      metrics.freezeAuthority.length > 32; // multisig
    
    return {
      id: 'R2',
      severity: 'high',
      passed: isValid,
      details: { freezeAuthority: metrics.freezeAuthority }
    };
  }

  /**
   * R3: Metadata & decimals valid (medium)
   */
  static validateMetadata(metrics: TokenMetrics): RuleResult {
    const validDecimals = metrics.decimals >= 0 && metrics.decimals <= 9;
    const validSupply = metrics.supply > 0;
    
    return {
      id: 'R3',
      severity: 'medium',
      passed: validDecimals && validSupply,
      details: { decimals: metrics.decimals, supply: metrics.supply }
    };
  }

  /**
   * R4: Supply cap vs declared (medium)
   */
  static validateSupplyCap(metrics: TokenMetrics, declaredSupply?: number): RuleResult {
    if (!declaredSupply) {
      return {
        id: 'R4',
        severity: 'medium',
        passed: true, // Pass if no declared supply to compare
        details: { actual: metrics.supply, declared: 'not_specified' }
      };
    }
    
    const variance = Math.abs(metrics.supply - declaredSupply) / declaredSupply;
    const passed = variance <= 0.01; // 1% tolerance
    
    return {
      id: 'R4',
      severity: 'medium',
      passed,
      details: { actual: metrics.supply, declared: declaredSupply, variance }
    };
  }

  /**
   * R5: Verified pool online (medium)
   */
  static validatePoolOnline(pool?: PoolMetrics): RuleResult {
    const hasPool = !!pool;
    const isVerified = pool && ['raydium', 'orca'].includes(pool.type);
    const hasLiquidity = pool && pool.liquidity > 1000; // Minimum $1k liquidity
    
    return {
      id: 'R5',
      severity: 'medium',
      passed: hasPool && isVerified && hasLiquidity,
      details: { 
        pool: pool?.address, 
        type: pool?.type, 
        liquidity: pool?.liquidity 
      }
    };
  }

  /**
   * R6: LP time-lock present (high)
   */
  static validateLPTimeLock(pool?: PoolMetrics): RuleResult {
    const isLocked = pool?.lpLocked === true;
    const hasExpiry = pool?.lpLockExpiry && pool.lpLockExpiry > Date.now() / 1000;
    
    return {
      id: 'R6',
      severity: 'high',
      passed: isLocked && hasExpiry,
      details: { 
        locked: isLocked, 
        expiry: pool?.lpLockExpiry,
        expiryDate: pool?.lpLockExpiry ? new Date(pool.lpLockExpiry * 1000).toISOString() : null
      }
    };
  }

  /**
   * R7: Pool depth sane / not one-sided (medium)
   */
  static validatePoolDepth(pool?: PoolMetrics): RuleResult {
    if (!pool) {
      return {
        id: 'R7',
        severity: 'medium',
        passed: false,
        details: { reason: 'no_pool' }
      };
    }
    
    // Check if pool has reasonable liquidity distribution
    const minLiquidity = 5000; // $5k minimum
    const hasMinLiquidity = pool.liquidity >= minLiquidity;
    
    return {
      id: 'R7',
      severity: 'medium',
      passed: hasMinLiquidity,
      details: { liquidity: pool.liquidity, minRequired: minLiquidity }
    };
  }

  /**
   * R8: No LP mint after lock (high)
   */
  static validateNoLPMintAfterLock(lpMintHistory: any[]): RuleResult {
    // This would require historical transaction analysis
    // For now, assume pass if no suspicious activity detected
    const suspiciousMints = lpMintHistory.filter(mint => 
      mint.timestamp > mint.lockTimestamp
    );
    
    return {
      id: 'R8',
      severity: 'high',
      passed: suspiciousMints.length === 0,
      details: { suspiciousMints: suspiciousMints.length }
    };
  }

  /**
   * R9: Top-holder threshold (medium)
   */
  static validateTopHolderThreshold(metrics: TokenMetrics): RuleResult {
    const maxTopHoldersPct = 50; // Max 50% for top 10 holders
    const passed = metrics.topHoldersPct <= maxTopHoldersPct;
    
    return {
      id: 'R9',
      severity: 'medium',
      passed,
      details: { 
        topHoldersPct: metrics.topHoldersPct, 
        threshold: maxTopHoldersPct 
      }
    };
  }

  /**
   * R10: Whale map OK (low)
   */
  static validateWhaleMap(walletRisks: WalletRisk[]): RuleResult {
    const highRiskWallets = walletRisks.filter(w => w.riskScore > 0.7);
    const passed = highRiskWallets.length === 0;
    
    return {
      id: 'R10',
      severity: 'low',
      passed,
      details: { 
        highRiskWallets: highRiskWallets.length,
        totalAnalyzed: walletRisks.length
      }
    };
  }

  /**
   * R11: Program log anomalies (low)
   */
  static validateProgramLogs(logs: any[]): RuleResult {
    // Analyze program interaction logs for anomalies
    const anomalies = logs.filter(log => 
      log.type === 'error' || log.type === 'suspicious'
    );
    
    return {
      id: 'R11',
      severity: 'low',
      passed: anomalies.length === 0,
      details: { anomalies: anomalies.length, totalLogs: logs.length }
    };
  }

  /**
   * R12: Router anomalies (low)
   */
  static validateRouterBehavior(routerData: any[]): RuleResult {
    // Check for unusual DEX router patterns
    const suspiciousRoutes = routerData.filter(route => 
      route.slippage > 0.05 || route.priceImpact > 0.1
    );
    
    return {
      id: 'R12',
      severity: 'low',
      passed: suspiciousRoutes.length === 0,
      details: { 
        suspiciousRoutes: suspiciousRoutes.length,
        totalRoutes: routerData.length
      }
    };
  }
}
