/**
 * SOLGuard Oracle - Helius Webhook Handler
 * Processes real-time blockchain events for token monitoring
 */

import express from 'express';
import { TokenAttestor } from './attestor';
import { RuleResult } from '@solguard/core';

export interface WebhookConfig {
  port: number;
  webhookSecret?: string;
  autoAttest: boolean;
  minLiquidity: number;
}

export class HeliusWebhookHandler {
  private app: express.Application;
  private attestor: TokenAttestor;
  private config: WebhookConfig;

  constructor(attestor: TokenAttestor, config: WebhookConfig) {
    this.attestor = attestor;
    this.config = config;
    this.app = express();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    
    // Webhook signature verification
    if (this.config.webhookSecret) {
      this.app.use('/webhook', (req, res, next) => {
        // TODO: Implement signature verification
        next();
      });
    }
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Helius webhook endpoint
    this.app.post('/webhook/helius', async (req, res) => {
      try {
        await this.handleHeliusWebhook(req.body);
        res.json({ success: true });
      } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    });

    // Manual attestation endpoint
    this.app.post('/attest/:mint', async (req, res) => {
      try {
        const { mint } = req.params;
        const { rulesetVersion = 1 } = req.body;
        
        const result = await this.attestor.scanAndAttest(mint, rulesetVersion);
        res.json({ success: true, result });
      } catch (error) {
        console.error('Manual attestation error:', error);
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });

    // Check attestation endpoint
    this.app.get('/attestation/:mint', async (req, res) => {
      try {
        const { mint } = req.params;
        const { rulesetVersion = 1 } = req.query;
        
        const result = await this.attestor.checkAttestation(mint, Number(rulesetVersion));
        res.json(result);
      } catch (error) {
        console.error('Check attestation error:', error);
        res.status(500).json({ error: 'Failed to check attestation' });
      }
    });

    // Batch attestation endpoint
    this.app.post('/batch-attest', async (req, res) => {
      try {
        const { mints, rulesetVersion = 1 } = req.body;
        
        if (!Array.isArray(mints)) {
          return res.status(400).json({ error: 'mints must be an array' });
        }
        
        const results = await this.attestor.batchAttest(mints, rulesetVersion);
        res.json({ success: true, results });
      } catch (error) {
        console.error('Batch attestation error:', error);
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
  }

  private async handleHeliusWebhook(payload: any) {
    console.log('📡 Received Helius webhook:', payload.type);

    switch (payload.type) {
      case 'TOKEN_MINT':
        await this.handleTokenMint(payload);
        break;
      case 'BALANCE_CHANGE':
        await this.handleBalanceChange(payload);
        break;
      case 'RAYDIUM_POOL_CREATE':
        await this.handlePoolCreate(payload);
        break;
      case 'WHALE_TRANSFER':
        await this.handleWhaleTransfer(payload);
        break;
      default:
        console.log(`⚠️ Unhandled webhook type: ${payload.type}`);
    }
  }

  private async handleTokenMint(payload: any) {
    try {
      const { mint, amount, authority } = payload.data;
      
      console.log(`🪙 New token mint detected: ${mint}`);
      
      // Check if this is a new token creation
      if (payload.data.isNewToken) {
        console.log(`🆕 New token created: ${mint}`);
        
        if (this.config.autoAttest) {
          // Wait a bit for metadata to settle
          setTimeout(async () => {
            try {
              await this.attestor.scanAndAttest(mint);
              console.log(`✅ Auto-attestation completed for ${mint}`);
            } catch (error) {
              console.error(`❌ Auto-attestation failed for ${mint}:`, error);
            }
          }, 30000); // 30 second delay
        }
      }
      
      // Check for R8 violation (LP mint after lock)
      await this.checkR8Violation(mint, payload);
      
    } catch (error) {
      console.error('Error handling token mint:', error);
    }
  }

  private async handleBalanceChange(payload: any) {
    try {
      const { account, mint, before, after } = payload.data;
      
      // Detect large balance changes (potential whale activity)
      const change = Math.abs(after - before);
      const changePercent = change / Math.max(before, after) * 100;
      
      if (changePercent > 10) { // 10% change threshold
        console.log(`🐋 Large balance change detected: ${account} (${changePercent.toFixed(2)}%)`);
        
        // Trigger re-attestation if this affects top holders
        const attestation = await this.attestor.checkAttestation(mint);
        if (attestation.exists && !attestation.revoked) {
          console.log(`🔄 Triggering re-scan due to whale activity: ${mint}`);
          // Could trigger re-attestation here
        }
      }
      
    } catch (error) {
      console.error('Error handling balance change:', error);
    }
  }

  private async handlePoolCreate(payload: any) {
    try {
      const { poolAddress, baseMint, quoteMint, liquidity } = payload.data;
      
      console.log(`🏊 New pool created: ${poolAddress} (${baseMint}/${quoteMint})`);
      
      // Check if this meets minimum liquidity requirements
      if (liquidity >= this.config.minLiquidity) {
        console.log(`💰 Pool meets liquidity threshold: $${liquidity}`);
        
        if (this.config.autoAttest) {
          // Attest both tokens in the pool
          for (const mint of [baseMint, quoteMint]) {
            try {
              const existing = await this.attestor.checkAttestation(mint);
              if (!existing.exists) {
                await this.attestor.scanAndAttest(mint);
                console.log(`✅ Auto-attestation completed for pool token: ${mint}`);
              }
            } catch (error) {
              console.error(`❌ Auto-attestation failed for pool token ${mint}:`, error);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Error handling pool create:', error);
    }
  }

  private async handleWhaleTransfer(payload: any) {
    try {
      const { from, to, mint, amount } = payload.data;
      
      console.log(`🐋 Whale transfer detected: ${amount} ${mint} (${from} → ${to})`);
      
      // Send Discord alert for R8 breaches and whale transfers
      await this.sendDiscordAlert({
        type: 'whale_transfer',
        mint,
        amount,
        from,
        to,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error handling whale transfer:', error);
    }
  }

  private async checkR8Violation(mint: string, payload: any) {
    try {
      // Check if this mint event violates R8 (LP mint after lock)
      const isLPToken = payload.data.isLPToken;
      const lockTimestamp = payload.data.lockTimestamp;
      
      if (isLPToken && lockTimestamp && Date.now() > lockTimestamp * 1000) {
        console.log(`🚨 R8 VIOLATION: LP mint after lock detected for ${mint}`);
        
        await this.sendDiscordAlert({
          type: 'r8_violation',
          mint,
          violation: 'LP mint after lock',
          timestamp: new Date().toISOString(),
          severity: 'HIGH'
        });
        
        // Could trigger automatic attestation revocation here
      }
      
    } catch (error) {
      console.error('Error checking R8 violation:', error);
    }
  }

  private async sendDiscordAlert(alert: any) {
    try {
      // TODO: Implement Discord webhook integration
      console.log('🚨 ALERT:', JSON.stringify(alert, null, 2));
      
      // Example Discord webhook call:
      // await axios.post(process.env.DISCORD_WEBHOOK_URL, {
      //   embeds: [{
      //     title: `SOLGuard Alert: ${alert.type}`,
      //     description: `Mint: ${alert.mint}`,
      //     color: alert.severity === 'HIGH' ? 0xff0000 : 0xffaa00,
      //     timestamp: alert.timestamp
      //   }]
      // });
      
    } catch (error) {
      console.error('Error sending Discord alert:', error);
    }
  }

  start() {
    this.app.listen(this.config.port, () => {
      console.log(`🚀 SOLGuard Oracle webhook server running on port ${this.config.port}`);
      console.log(`📡 Helius webhook endpoint: /webhook/helius`);
      console.log(`🔍 Manual attestation: POST /attest/:mint`);
      console.log(`📊 Check attestation: GET /attestation/:mint`);
      console.log(`📦 Batch attestation: POST /batch-attest`);
    });
  }
}
