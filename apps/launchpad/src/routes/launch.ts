/**
 * SOLGuard Launchpad - Launch Routes
 * Token launch endpoints with TSV-1 verification
 */

import { Router, Request, Response } from 'express';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AttestationMiddleware } from '../middleware/attestation';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';

export interface LaunchConfig {
  endpoint: string;
  launchFee: number; // SOL
  treasuryWallet: string;
  maxSupply: number;
  minLiquidity: number; // USD
}

export class LaunchRoutes {
  private router: Router;
  private connection: Connection;
  private attestationMiddleware: AttestationMiddleware;
  private config: LaunchConfig;

  constructor(attestationMiddleware: AttestationMiddleware, config: LaunchConfig) {
    this.router = Router();
    this.connection = new Connection(config.endpoint, 'confirmed');
    this.attestationMiddleware = attestationMiddleware;
    this.config = config;
    
    this.setupRoutes();
  }

  private setupRoutes() {
    // Rate limiting
    const launchLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 3, // 3 launches per 15 minutes per IP
      message: { error: 'Too many launch attempts, please try again later' }
    });

    // Get launch requirements
    this.router.get('/requirements', this.getRequirements.bind(this));

    // Check token eligibility
    this.router.post('/check/:mint', this.checkEligibility.bind(this));

    // Submit token for launch (requires attestation)
    this.router.post('/submit', 
      launchLimiter,
      this.attestationMiddleware.requireAttestation(),
      this.submitLaunch.bind(this)
    );

    // Get launch status
    this.router.get('/status/:mint', this.getLaunchStatus.bind(this));

    // List verified tokens
    this.router.get('/verified', this.getVerifiedTokens.bind(this));
  }

  private async getRequirements(req: Request, res: Response) {
    try {
      res.json({
        success: true,
        requirements: {
          tsv1_verification: {
            required: true,
            min_grade: 'yellow',
            ruleset_version: 1
          },
          launch_fee: {
            amount: this.config.launchFee,
            currency: 'SOL',
            treasury: this.config.treasuryWallet
          },
          token_limits: {
            max_supply: this.config.maxSupply,
            min_liquidity_usd: this.config.minLiquidity
          },
          security_requirements: [
            'Mint authority must be multisig or null',
            'Freeze authority must be multisig or null',
            'Valid metadata with proper fields',
            'Supply cap must be reasonable',
            'Pool must be verified and online',
            'LP tokens must be time-locked',
            'Sufficient pool depth',
            'No LP minting after lock',
            'Top holders below threshold',
            'Whale distribution acceptable',
            'No program log anomalies',
            'No router behavior anomalies'
          ]
        }
      });
    } catch (error) {
      console.error('Error getting requirements:', error);
      res.status(500).json({ success: false, error: 'Failed to get requirements' });
    }
  }

  private async checkEligibility(req: Request, res: Response) {
    try {
      const { mint } = req.params;
      
      // Validate mint
      const schema = Joi.object({
        mint: Joi.string().required().length(44)
      });
      
      const { error } = schema.validate({ mint });
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid mint address'
        });
      }

      // Check attestation
      const attestation = await this.attestationMiddleware.getAttestationInfo(mint);
      
      // Check if already launched
      const launchStatus = await this.getLaunchStatusInternal(mint);
      
      // Additional checks
      const eligibility = {
        mint,
        eligible: attestation.tsv1_verified && !launchStatus.launched,
        attestation,
        launch_status: launchStatus,
        requirements_met: {
          tsv1_verified: attestation.tsv1_verified,
          not_already_launched: !launchStatus.launched,
          grade_sufficient: attestation.attestation.grade === 'green' || attestation.attestation.grade === 'yellow'
        }
      };

      res.json({
        success: true,
        eligibility
      });

    } catch (error) {
      console.error('Error checking eligibility:', error);
      res.status(500).json({ success: false, error: 'Failed to check eligibility' });
    }
  }

  private async submitLaunch(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        mint: Joi.string().required().length(44),
        launcher: Joi.string().required().length(44),
        metadata: Joi.object({
          name: Joi.string().required().max(32),
          symbol: Joi.string().required().max(10),
          description: Joi.string().required().max(200),
          image: Joi.string().uri().required(),
          website: Joi.string().uri().optional(),
          twitter: Joi.string().optional(),
          telegram: Joi.string().optional(),
          discord: Joi.string().optional()
        }).required(),
        launch_config: Joi.object({
          initial_price: Joi.number().positive().required(),
          liquidity_sol: Joi.number().positive().min(1).required(),
          launch_time: Joi.date().iso().optional()
        }).required(),
        fee_payment_signature: Joi.string().required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid launch data',
          details: error.details
        });
      }

      const { mint, launcher, metadata, launch_config, fee_payment_signature } = value;

      // Verify fee payment
      const feeVerified = await this.verifyFeePayment(fee_payment_signature, launcher);
      if (!feeVerified) {
        return res.status(400).json({
          success: false,
          error: 'Launch fee payment not verified'
        });
      }

      // Check if already launched
      const existingLaunch = await this.getLaunchStatusInternal(mint);
      if (existingLaunch.launched) {
        return res.status(409).json({
          success: false,
          error: 'Token already launched'
        });
      }

      // Create launch record
      const launchId = await this.createLaunchRecord({
        mint,
        launcher,
        metadata,
        launch_config,
        attestation: req.attestation!,
        fee_signature: fee_payment_signature,
        status: 'pending',
        created_at: new Date()
      });

      res.json({
        success: true,
        launch: {
          id: launchId,
          mint,
          status: 'pending',
          message: 'Launch submitted successfully. Token will be available once reviewed.'
        }
      });

    } catch (error) {
      console.error('Error submitting launch:', error);
      res.status(500).json({ success: false, error: 'Failed to submit launch' });
    }
  }

  private async getLaunchStatus(req: Request, res: Response) {
    try {
      const { mint } = req.params;
      const status = await this.getLaunchStatusInternal(mint);
      
      res.json({
        success: true,
        status
      });

    } catch (error) {
      console.error('Error getting launch status:', error);
      res.status(500).json({ success: false, error: 'Failed to get launch status' });
    }
  }

  private async getVerifiedTokens(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, grade } = req.query;
      
      // This would query a database of launched tokens
      // For now, return mock data
      const tokens = await this.getVerifiedTokensList({
        page: Number(page),
        limit: Number(limit),
        grade: grade as string
      });

      res.json({
        success: true,
        tokens,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: tokens.length
        }
      });

    } catch (error) {
      console.error('Error getting verified tokens:', error);
      res.status(500).json({ success: false, error: 'Failed to get verified tokens' });
    }
  }

  // Helper methods

  private async verifyFeePayment(signature: string, payer: string): Promise<boolean> {
    try {
      const tx = await this.connection.getParsedTransaction(signature);
      if (!tx || !tx.meta || tx.meta.err) {
        return false;
      }

      const treasuryPk = new PublicKey(this.config.treasuryWallet);
      const payerPk = new PublicKey(payer);
      
      // Look for SOL transfer to treasury
      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;
      const accountKeys = tx.transaction.message.accountKeys;
      
      const treasuryIndex = accountKeys.findIndex(key => key.pubkey.equals(treasuryPk));
      const payerIndex = accountKeys.findIndex(key => key.pubkey.equals(payerPk));
      
      if (treasuryIndex === -1 || payerIndex === -1) {
        return false;
      }
      
      const treasuryReceived = (postBalances[treasuryIndex] - preBalances[treasuryIndex]) / LAMPORTS_PER_SOL;
      const expectedFee = this.config.launchFee;
      
      return Math.abs(treasuryReceived - expectedFee) < 0.001; // Allow small precision differences

    } catch (error) {
      console.error('Error verifying fee payment:', error);
      return false;
    }
  }

  private async createLaunchRecord(launchData: any): Promise<string> {
    // This would insert into a database
    // For now, return a mock ID
    const launchId = `launch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('📝 Created launch record:', {
      id: launchId,
      mint: launchData.mint,
      launcher: launchData.launcher,
      status: launchData.status
    });
    
    return launchId;
  }

  private async getLaunchStatusInternal(mint: string) {
    // This would query a database
    // For now, return mock data
    return {
      mint,
      launched: false,
      status: 'not_launched',
      launch_time: null,
      launch_id: null
    };
  }

  private async getVerifiedTokensList(options: {
    page: number;
    limit: number;
    grade?: string;
  }) {
    // This would query a database of launched tokens
    // For now, return empty array
    return [];
  }

  getRouter(): Router {
    return this.router;
  }
}

export default LaunchRoutes;
