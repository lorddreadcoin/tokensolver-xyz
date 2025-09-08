/**
 * SOLGuard Launchpad - Attestation Middleware
 * Enforces TSV-1 verification requirements for token launches
 */

import { Request, Response, NextFunction } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { numberToGrade } from '@solguard/core';
import Joi from 'joi';

export interface AttestationConfig {
  endpoint: string;
  programId: string;
  idlPath: string;
  minGrade: 'yellow' | 'green';
  rulesetVersion: number;
}

export interface AttestationResult {
  exists: boolean;
  valid: boolean;
  score?: number;
  grade?: string;
  attestedAt?: Date;
  revoked?: boolean;
  reason?: string;
}

export class AttestationMiddleware {
  private connection: Connection;
  private program: Program | null;
  private config: AttestationConfig;

  constructor(config: AttestationConfig) {
    this.config = config;
    this.connection = new Connection(config.endpoint, 'confirmed');
    
    // Setup program (read-only, no wallet needed for verification)
    try {
      const idl = require(config.idlPath);
      const provider = new AnchorProvider(
        this.connection,
        {} as any, // No wallet needed for read operations
        { commitment: 'confirmed' }
      );
      
      this.program = new Program(idl, new PublicKey(config.programId), provider);
    } catch (error) {
      console.warn('Warning: Could not load Anchor program IDL. Attestation verification will be disabled.');
      console.warn('To enable attestations, build the contracts with: npm run contracts:build');
      this.program = null;
    }
  }

  /**
   * Express middleware to require valid attestation
   */
  requireAttestation = () => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { mint } = req.body;
        
        // Validate mint parameter
        const schema = Joi.object({
          mint: Joi.string().required().length(44) // Base58 pubkey length
        });
        
        const { error } = schema.validate({ mint });
        if (error) {
          return res.status(400).json({
            success: false,
            error: 'Invalid mint address',
            details: error.details
          });
        }
        
        // Check attestation
        const result = await this.checkAttestation(mint);
        
        if (!result.valid) {
          return res.status(403).json({
            success: false,
            error: 'SOLGuard attestation required',
            attestation: result
          });
        }
        
        // Add attestation info to request for downstream use
        req.attestation = result;
        next();
        
      } catch (error) {
        console.error('Attestation middleware error:', error);
        res.status(500).json({
          success: false,
          error: 'Attestation verification failed'
        });
      }
    };
  };

  /**
   * Check if token has valid attestation
   */
  private async checkAttestation(mintAddress: string): Promise<AttestationResult> {
    try {
      // If program is not available, return not verified
      if (!this.program) {
        return {
          exists: false,
          valid: false,
          reason: 'Attestation verification unavailable - contracts not deployed'
        };
      }

      const mintPk = new PublicKey(mintAddress);
      
      // Derive attestation PDA
      const [attestationPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('attest'),
          mintPk.toBuffer(),
          Buffer.from(new Uint16Array([this.config.rulesetVersion]).buffer)
        ],
        this.program.programId
      );
      
      // Fetch attestation account
      const account = await this.program.account.attestation.fetchNullable(attestationPda);
      
      if (!account) {
        return {
          exists: false,
          valid: false,
          reason: 'No SOLGuard attestation found'
        };
      }
      
      // Check if revoked
      if (account.revoked) {
        return {
          exists: true,
          valid: false,
          revoked: true,
          reason: 'Attestation has been revoked'
        };
      }
      
      // Check grade meets minimum requirement
      const grade = numberToGrade(account.grade as number);
      const score = (account.scoreBps as number) / 10000;
      const minGradeValue = this.config.minGrade === 'green' ? 2 : 1;
      
      if ((account.grade as number) < minGradeValue) {
        return {
          exists: true,
          valid: false,
          score,
          grade,
          attestedAt: new Date((account.attestedAt as number) * 1000),
          revoked: false,
          reason: `Grade ${grade.toUpperCase()} below minimum requirement ${this.config.minGrade.toUpperCase()}`
        };
      }
      
      return {
        exists: true,
        valid: true,
        score,
        grade,
        attestedAt: new Date((account.attestedAt as number) * 1000),
        revoked: false
      };
      
    } catch (error) {
      console.error('Error checking attestation:', error);
      return {
        exists: false,
        valid: false,
        reason: 'Failed to verify attestation'
      };
    }
  }

  /**
   * Get attestation info for API responses
   */
  async getAttestationInfo(mintAddress: string) {
    const result = await this.checkAttestation(mintAddress);
    
    return {
      mint: mintAddress,
      tsv1_verified: result.valid,
      attestation: {
        exists: result.exists,
        score: result.score,
        grade: result.grade,
        attested_at: result.attestedAt?.toISOString(),
        revoked: result.revoked,
        reason: result.reason
      }
    };
  }

  /**
   * Batch check multiple tokens
   */
  async batchCheckAttestations(mintAddresses: string[]): Promise<Record<string, AttestationResult>> {
    const results: Record<string, AttestationResult> = {};
    
    // Process in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < mintAddresses.length; i += concurrency) {
      const batch = mintAddresses.slice(i, i + concurrency);
      const batchPromises = batch.map(async (mint) => {
        const result = await this.checkAttestation(mint);
        return { mint, result };
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ mint, result }) => {
        results[mint] = result;
      });
    }
    
    return results;
  }
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      attestation?: AttestationResult;
    }
  }
}

export default AttestationMiddleware;
