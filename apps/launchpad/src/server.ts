/**
 * SOLGuard Launchpad - Main Server
 * Express server with TSV-1 verification middleware
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import { AttestationMiddleware } from './middleware/attestation';
import { LaunchRoutes } from './routes/launch';
import { GuardRoutes } from './routes/guard';

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' }
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize attestation middleware
const attestationMiddleware = new AttestationMiddleware({
  endpoint: process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
  programId: process.env.SOLGUARD_PROGRAM_ID || 'SGRDxvmPLrVkKf4XKbCDjGb8vFH6XkBMTn4nE8GhqKVy',
  idlPath: process.env.SOLGUARD_IDL_PATH || '../../../contracts/solguard-registry/target/idl/solguard_registry.json',
  minGrade: (process.env.MIN_GRADE as 'yellow' | 'green') || 'yellow',
  rulesetVersion: parseInt(process.env.RULESET_VERSION || '1')
});

// Initialize launch routes
const launchRoutes = new LaunchRoutes(attestationMiddleware, {
  endpoint: process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
  launchFee: parseFloat(process.env.LAUNCH_FEE_SOL || '0.1'),
  treasuryWallet: process.env.TREASURY_WALLET || 'TokenSoLverTreasuryWaLLet11111111111111111',
  maxSupply: parseInt(process.env.MAX_SUPPLY || '1000000000'),
  minLiquidity: parseInt(process.env.MIN_LIQUIDITY_USD || '10000')
});

// Initialize guard routes
const guardRoutes = new GuardRoutes(attestationMiddleware);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'solguard-launchpad'
  });
});

// API routes
app.use('/api/launch', launchRoutes.getRouter());
app.use('/api/guard', guardRoutes.getRouter());

// Attestation info endpoint
app.get('/api/attestation/:mint', async (req, res) => {
  try {
    const { mint } = req.params;
    const info = await attestationMiddleware.getAttestationInfo(mint);
    res.json({ success: true, ...info });
  } catch (error) {
    console.error('Error getting attestation info:', error);
    res.status(500).json({ success: false, error: 'Failed to get attestation info' });
  }
});

// Batch attestation check
app.post('/api/attestations/batch', async (req, res) => {
  try {
    const { mints } = req.body;
    
    if (!Array.isArray(mints) || mints.length === 0) {
      return res.status(400).json({ error: 'mints array is required' });
    }
    
    if (mints.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 mints per batch' });
    }
    
    const results = await attestationMiddleware.batchCheckAttestations(mints);
    res.json({ success: true, results });
  } catch (error) {
    console.error('Error batch checking attestations:', error);
    res.status(500).json({ success: false, error: 'Failed to check attestations' });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /health',
      'GET /api/launch/requirements',
      'POST /api/launch/check/:mint',
      'POST /api/launch/submit',
      'GET /api/launch/status/:mint',
      'GET /api/launch/verified',
      'GET /api/attestation/:mint',
      'POST /api/attestations/batch'
    ]
  });
});

// Error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 SOLGuard Launchpad server running on port ${PORT}`);
  console.log(`🔒 Security: TSV-1 verification required`);
  console.log(`📊 Min Grade: ${process.env.MIN_GRADE || 'yellow'}`);
  console.log(`💰 Launch Fee: ${process.env.LAUNCH_FEE_SOL || '0.1'} SOL`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  console.log('\n📋 Available Endpoints:');
  console.log('  GET  /health                    - Health check');
  console.log('  GET  /api/launch/requirements   - Get launch requirements');
  console.log('  POST /api/launch/check/:mint    - Check token eligibility');
  console.log('  POST /api/launch/submit         - Submit token for launch');
  console.log('  GET  /api/launch/status/:mint   - Get launch status');
  console.log('  GET  /api/launch/verified       - List verified tokens');
  console.log('  GET  /api/attestation/:mint     - Get attestation info');
  console.log('  POST /api/attestations/batch    - Batch check attestations');
});

export default app;
