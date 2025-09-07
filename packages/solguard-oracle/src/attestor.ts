/**
 * SOLGuard Oracle - Attestation Service
 * Handles on-chain attestation of token scan results
 */

import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { keccak_256 } from '@noble/hashes/sha3';
import { gradeFromRules, gradeToNumber, RuleResult, RuleSetResult } from '@solguard/core';
import { TokenScanner, ScannerConfig } from './scanner';
import * as fs from 'fs';

export interface AttestorConfig extends ScannerConfig {
  oracleKeypairPath: string;
  programId: string;
  idlPath: string;
}

export class TokenAttestor {
  private scanner: TokenScanner;
  private connection: Connection;
  private program: Program;
  private oracle: Keypair;
  private config: AttestorConfig;

  constructor(config: AttestorConfig) {
    this.config = config;
    this.scanner = new TokenScanner(config);
    this.connection = new Connection(config.quickNodeEndpoint, 'confirmed');
    
    // Load oracle keypair
    const keypairData = JSON.parse(fs.readFileSync(config.oracleKeypairPath, 'utf8'));
    this.oracle = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    // Setup Anchor program
    const idl = JSON.parse(fs.readFileSync(config.idlPath, 'utf8'));
    const provider = new AnchorProvider(
      this.connection,
      new Wallet(this.oracle),
      { commitment: 'confirmed' }
    );
    
    this.program = new Program(idl, new PublicKey(config.programId), provider);
  }

  /**
   * Scan token and create on-chain attestation
   */
  async scanAndAttest(mintAddress: string, rulesetVersion: number = 1): Promise<{
    transaction: string;
    attestationPda: string;
    score: number;
    grade: string;
    proofHash: string;
  }> {
    console.log(`🚀 Starting scan and attestation for ${mintAddress}`);
    
    try {
      // 1. Perform off-chain scan
      const rules = await this.scanner.scanToken(mintAddress);
      
      // 2. Calculate score and grade
      const { score, grade } = gradeFromRules(rules);
      
      // 3. Create proof bundle
      const ruleSetResult: RuleSetResult = {
        mint: mintAddress,
        ruleset_version: rulesetVersion,
        scored_at: new Date().toISOString(),
        rules,
        score,
        grade,
        proofs: {
          oracle: 'solguard-oracle-v1',
          timestamp: Date.now(),
          endpoint: this.config.quickNodeEndpoint,
          version: '1.0.0'
        }
      };
      
      // 4. Hash the proof
      const proofHash = keccak_256(new TextEncoder().encode(JSON.stringify(ruleSetResult)));
      
      // 5. Create on-chain attestation
      const transaction = await this.createAttestation(
        mintAddress,
        rulesetVersion,
        score,
        grade,
        proofHash
      );
      
      // 6. Get attestation PDA
      const attestationPda = this.getAttestationPDA(mintAddress, rulesetVersion);
      
      console.log(`✅ Attestation successful!`);
      console.log(`📊 Score: ${score.toFixed(4)} (${grade.toUpperCase()})`);
      console.log(`📝 Transaction: ${transaction}`);
      
      return {
        transaction,
        attestationPda: attestationPda.toBase58(),
        score,
        grade,
        proofHash: Buffer.from(proofHash).toString('hex')
      };
      
    } catch (error) {
      console.error('❌ Scan and attestation failed:', error);
      throw error;
    }
  }

  /**
   * Create on-chain attestation
   */
  private async createAttestation(
    mintAddress: string,
    rulesetVersion: number,
    score: number,
    grade: string,
    proofHash: Uint8Array
  ): Promise<string> {
    
    const mintPk = new PublicKey(mintAddress);
    
    // Derive PDAs
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      this.program.programId
    );
    
    const [oraclePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('oracle'), this.oracle.publicKey.toBuffer()],
      this.program.programId
    );
    
    const [attestationPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('attest'),
        mintPk.toBuffer(),
        Buffer.from(new Uint16Array([rulesetVersion]).buffer)
      ],
      this.program.programId
    );
    
    // Call attest_token instruction
    const tx = await this.program.methods
      .attestToken(
        rulesetVersion,
        Math.round(score * 10000), // Convert to basis points
        gradeToNumber(grade),
        Array.from(proofHash)
      )
      .accounts({
        config: configPda,
        oracle: oraclePda,
        mint: mintPk,
        attestation: attestationPda,
        signer: this.oracle.publicKey,
        systemProgram: PublicKey.default,
      })
      .signers([this.oracle])
      .rpc();
    
    return tx;
  }

  /**
   * Get attestation PDA for a token
   */
  getAttestationPDA(mintAddress: string, rulesetVersion: number): PublicKey {
    const [attestationPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('attest'),
        new PublicKey(mintAddress).toBuffer(),
        Buffer.from(new Uint16Array([rulesetVersion]).buffer)
      ],
      this.program.programId
    );
    
    return attestationPda;
  }

  /**
   * Check if token has valid attestation
   */
  async checkAttestation(mintAddress: string, rulesetVersion: number = 1): Promise<{
    exists: boolean;
    score?: number;
    grade?: string;
    attestedAt?: Date;
    revoked?: boolean;
  }> {
    try {
      const attestationPda = this.getAttestationPDA(mintAddress, rulesetVersion);
      const account = await this.program.account.attestation.fetchNullable(attestationPda);
      
      if (!account) {
        return { exists: false };
      }
      
      return {
        exists: true,
        score: account.scoreBps / 10000,
        grade: ['red', 'yellow', 'green'][account.grade],
        attestedAt: new Date(account.attestedAt * 1000),
        revoked: account.revoked
      };
      
    } catch (error) {
      console.error('Error checking attestation:', error);
      return { exists: false };
    }
  }

  /**
   * Batch attest multiple tokens
   */
  async batchAttest(mintAddresses: string[], rulesetVersion: number = 1): Promise<Array<{
    mint: string;
    success: boolean;
    result?: any;
    error?: string;
  }>> {
    const results = [];
    
    for (const mint of mintAddresses) {
      try {
        console.log(`🔄 Processing ${mint}...`);
        const result = await this.scanAndAttest(mint, rulesetVersion);
        results.push({ mint, success: true, result });
        
        // Add delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Failed to attest ${mint}:`, error);
        results.push({ 
          mint, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }
    
    return results;
  }

  /**
   * Monitor for new tokens and auto-attest
   */
  async startMonitoring(options: {
    interval: number; // milliseconds
    autoAttest: boolean;
    minLiquidity?: number;
  }) {
    console.log(`🔍 Starting token monitoring (interval: ${options.interval}ms)`);
    
    const monitor = async () => {
      try {
        // This would integrate with Helius webhooks or similar
        // For now, just log that monitoring is active
        console.log(`⏰ Monitoring tick at ${new Date().toISOString()}`);
        
        // TODO: Implement actual token discovery logic
        // - Listen to Helius webhooks for new token creation
        // - Filter by liquidity thresholds
        // - Auto-attest qualifying tokens
        
      } catch (error) {
        console.error('❌ Monitoring error:', error);
      }
    };
    
    // Start monitoring loop
    setInterval(monitor, options.interval);
    monitor(); // Run immediately
  }
}
