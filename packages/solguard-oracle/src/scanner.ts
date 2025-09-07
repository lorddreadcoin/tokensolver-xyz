/**
 * SOLGuard Oracle - Token Scanner
 * Performs off-chain analysis using QuickNode and Helius APIs
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { RuleResult, TokenMetrics, PoolMetrics, WalletRisk, RuleValidator } from '@solguard/core';
import axios from 'axios';

export interface ScannerConfig {
  quickNodeEndpoint: string;
  quickNodeApiKey?: string;
  heliusApiKey?: string;
  solscanApiKey?: string;
}

export class TokenScanner {
  private connection: Connection;
  private config: ScannerConfig;

  constructor(config: ScannerConfig) {
    this.config = config;
    this.connection = new Connection(config.quickNodeEndpoint, 'confirmed');
  }

  /**
   * Perform complete TSV-1 scan of a token
   */
  async scanToken(mintAddress: string): Promise<RuleResult[]> {
    console.log(`🔍 Starting TSV-1 scan for token: ${mintAddress}`);
    
    try {
      // Gather all required data
      const [tokenMetrics, poolMetrics, walletRisks, lpHistory, logs, routerData] = await Promise.all([
        this.getTokenMetrics(mintAddress),
        this.getPoolMetrics(mintAddress),
        this.getWalletRisks(mintAddress),
        this.getLPMintHistory(mintAddress),
        this.getProgramLogs(mintAddress),
        this.getRouterData(mintAddress)
      ]);

      // Run all validation rules
      const rules: RuleResult[] = [
        RuleValidator.validateMintAuthority(tokenMetrics),
        RuleValidator.validateFreezeAuthority(tokenMetrics),
        RuleValidator.validateMetadata(tokenMetrics),
        RuleValidator.validateSupplyCap(tokenMetrics),
        RuleValidator.validatePoolOnline(poolMetrics),
        RuleValidator.validateLPTimeLock(poolMetrics),
        RuleValidator.validatePoolDepth(poolMetrics),
        RuleValidator.validateNoLPMintAfterLock(lpHistory),
        RuleValidator.validateTopHolderThreshold(tokenMetrics),
        RuleValidator.validateWhaleMap(walletRisks),
        RuleValidator.validateProgramLogs(logs),
        RuleValidator.validateRouterBehavior(routerData)
      ];

      console.log(`✅ TSV-1 scan completed: ${rules.filter(r => r.passed).length}/${rules.length} rules passed`);
      return rules;

    } catch (error) {
      console.error('❌ Token scan failed:', error);
      throw error;
    }
  }

  /**
   * Get token metrics from on-chain data
   */
  private async getTokenMetrics(mintAddress: string): Promise<TokenMetrics> {
    try {
      const mintPk = new PublicKey(mintAddress);
      
      // Get mint account info
      const mintInfo = await this.connection.getParsedAccountInfo(mintPk);
      if (!mintInfo.value?.data || typeof mintInfo.value.data === 'string') {
        throw new Error('Invalid mint account');
      }

      const parsedData = mintInfo.value.data.parsed.info;
      
      // Get holder count from Helius or fallback method
      const holders = await this.getHolderCount(mintAddress);
      const topHoldersPct = await this.getTopHoldersPercentage(mintAddress);

      return {
        supply: parseInt(parsedData.supply),
        decimals: parsedData.decimals,
        mintAuthority: parsedData.mintAuthority,
        freezeAuthority: parsedData.freezeAuthority,
        holders,
        topHoldersPct
      };

    } catch (error) {
      console.error('Error getting token metrics:', error);
      throw error;
    }
  }

  /**
   * Get pool metrics from DEX APIs
   */
  private async getPoolMetrics(mintAddress: string): Promise<PoolMetrics | undefined> {
    try {
      // Try Raydium API first
      const raydiumPools = await this.getRaydiumPools(mintAddress);
      if (raydiumPools.length > 0) {
        const pool = raydiumPools[0];
        return {
          address: pool.id,
          type: 'raydium',
          baseToken: pool.baseMint,
          quoteToken: pool.quoteMint,
          liquidity: pool.liquidity || 0,
          volume24h: pool.volume24h || 0,
          lpLocked: await this.checkLPLock(pool.lpMint),
          lpLockExpiry: await this.getLPLockExpiry(pool.lpMint)
        };
      }

      // Fallback to other DEXs
      return undefined;

    } catch (error) {
      console.error('Error getting pool metrics:', error);
      return undefined;
    }
  }

  /**
   * Analyze wallet risks for top holders
   */
  private async getWalletRisks(mintAddress: string): Promise<WalletRisk[]> {
    try {
      const topHolders = await this.getTopHolders(mintAddress, 20);
      const risks: WalletRisk[] = [];

      for (const holder of topHolders) {
        const risk = await this.analyzeWalletRisk(holder.address);
        risks.push(risk);
      }

      return risks;

    } catch (error) {
      console.error('Error analyzing wallet risks:', error);
      return [];
    }
  }

  /**
   * Get LP mint history to check for post-lock minting
   */
  private async getLPMintHistory(mintAddress: string): Promise<any[]> {
    try {
      // This would require detailed transaction history analysis
      // For now, return empty array (assumes no violations)
      return [];
    } catch (error) {
      console.error('Error getting LP mint history:', error);
      return [];
    }
  }

  /**
   * Get program interaction logs
   */
  private async getProgramLogs(mintAddress: string): Promise<any[]> {
    try {
      // Analyze recent program logs for anomalies
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(mintAddress),
        { limit: 100 }
      );

      const logs = [];
      for (const sig of signatures.slice(0, 10)) { // Analyze recent 10 transactions
        try {
          const tx = await this.connection.getParsedTransaction(sig.signature);
          if (tx?.meta?.logMessages) {
            logs.push({
              signature: sig.signature,
              logs: tx.meta.logMessages,
              type: tx.meta.err ? 'error' : 'success'
            });
          }
        } catch (e) {
          // Skip failed transaction fetches
        }
      }

      return logs;

    } catch (error) {
      console.error('Error getting program logs:', error);
      return [];
    }
  }

  /**
   * Get router behavior data
   */
  private async getRouterData(mintAddress: string): Promise<any[]> {
    try {
      // This would analyze DEX router interactions
      // For now, return empty array (assumes no anomalies)
      return [];
    } catch (error) {
      console.error('Error getting router data:', error);
      return [];
    }
  }

  // Helper methods

  private async getHolderCount(mintAddress: string): Promise<number> {
    try {
      if (this.config.heliusApiKey) {
        const response = await axios.post(
          `https://api.helius.xyz/v0/token-metadata?api-key=${this.config.heliusApiKey}`,
          { mintAccounts: [mintAddress] }
        );
        return response.data[0]?.holderCount || 0;
      }
      
      // Fallback: estimate from token accounts
      const tokenAccounts = await this.connection.getProgramAccounts(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        {
          filters: [
            { dataSize: 165 },
            { memcmp: { offset: 0, bytes: mintAddress } }
          ]
        }
      );
      
      return tokenAccounts.length;

    } catch (error) {
      console.error('Error getting holder count:', error);
      return 0;
    }
  }

  private async getTopHoldersPercentage(mintAddress: string): Promise<number> {
    try {
      const holders = await this.getTopHolders(mintAddress, 10);
      const totalSupply = await this.getTotalSupply(mintAddress);
      
      const topHoldersBalance = holders.reduce((sum, holder) => sum + holder.balance, 0);
      return (topHoldersBalance / totalSupply) * 100;

    } catch (error) {
      console.error('Error calculating top holders percentage:', error);
      return 0;
    }
  }

  private async getTopHolders(mintAddress: string, limit: number): Promise<Array<{address: string, balance: number}>> {
    try {
      // This would use Helius or similar service for efficient holder analysis
      // For now, return mock data
      return [];
    } catch (error) {
      console.error('Error getting top holders:', error);
      return [];
    }
  }

  private async getTotalSupply(mintAddress: string): Promise<number> {
    try {
      const mintInfo = await this.connection.getParsedAccountInfo(new PublicKey(mintAddress));
      if (mintInfo.value?.data && typeof mintInfo.value.data !== 'string') {
        return parseInt(mintInfo.value.data.parsed.info.supply);
      }
      return 0;
    } catch (error) {
      console.error('Error getting total supply:', error);
      return 0;
    }
  }

  private async getRaydiumPools(mintAddress: string): Promise<any[]> {
    try {
      const response = await axios.get(`https://api.raydium.io/v2/sdk/liquidity/mainnet.json`);
      return response.data.official.filter((pool: any) => 
        pool.baseMint === mintAddress || pool.quoteMint === mintAddress
      );
    } catch (error) {
      console.error('Error getting Raydium pools:', error);
      return [];
    }
  }

  private async checkLPLock(lpMint: string): Promise<boolean> {
    try {
      // Check if LP tokens are locked (would require integration with lock services)
      return false; // Default to false for now
    } catch (error) {
      return false;
    }
  }

  private async getLPLockExpiry(lpMint: string): Promise<number | undefined> {
    try {
      // Get LP lock expiry timestamp
      return undefined; // Would integrate with lock services
    } catch (error) {
      return undefined;
    }
  }

  private async analyzeWalletRisk(address: string): Promise<WalletRisk> {
    try {
      // Analyze wallet for risk factors
      return {
        address,
        riskScore: 0, // Low risk by default
        flags: [],
        connections: []
      };
    } catch (error) {
      return {
        address,
        riskScore: 0,
        flags: ['analysis_failed'],
        connections: []
      };
    }
  }
}
