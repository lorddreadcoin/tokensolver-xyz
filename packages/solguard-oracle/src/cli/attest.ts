/**
 * SOLGuard Oracle CLI - Token Attestation
 */

import { keccak_256 } from '@noble/hashes/sha3';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { gradeFromRules, gradeToNumber, RuleResult } from '@solguard/core';
import * as fs from 'fs';
import * as path from 'path';

// Import IDL (will be generated after anchor build)
const IDL_PATH = path.join(__dirname, '../idl/solguard_registry.json');

export interface AttestOptions {
  mint: string;
  rulesetVersion: number;
  rules: RuleResult[];
  endpoint: string;
  keypairPath: string;
  programId?: string;
}

export async function attestToken(options: AttestOptions) {
  try {
    // Load IDL
    if (!fs.existsSync(IDL_PATH)) {
      throw new Error(`IDL not found at ${IDL_PATH}. Run 'anchor build' first.`);
    }
    
    const idl = JSON.parse(fs.readFileSync(IDL_PATH, 'utf8'));
    
    // Calculate score and grade
    const { score, grade } = gradeFromRules(options.rules);
    
    // Create proof payload
    const payload = {
      mint: options.mint,
      ruleset_version: options.rulesetVersion,
      scored_at: new Date().toISOString(),
      rules: options.rules,
      score,
      grade,
      proofs: {
        // Add actual proof data here
        timestamp: Date.now(),
        oracle: 'solguard-oracle-v1'
      }
    };
    
    // Hash the proof payload
    const proofHash = keccak_256(new TextEncoder().encode(JSON.stringify(payload)));
    
    // Setup connection and wallet
    const connection = new Connection(options.endpoint, 'confirmed');
    const keypairData = JSON.parse(fs.readFileSync(options.keypairPath, 'utf8'));
    const wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    const provider = new AnchorProvider(
      connection, 
      new Wallet(wallet), 
      { commitment: 'confirmed' }
    );
    
    // Create program instance
    const programId = new PublicKey(options.programId || idl.metadata.address);
    const program = new Program(idl, programId, provider);
    
    // Derive PDAs
    const mintPk = new PublicKey(options.mint);
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')], 
      programId
    );
    const [oraclePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('oracle'), wallet.publicKey.toBuffer()], 
      programId
    );
    const [attestationPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('attest'), 
        mintPk.toBuffer(), 
        Buffer.from(new Uint16Array([options.rulesetVersion]).buffer)
      ], 
      programId
    );
    
    console.log(`🔍 Attesting token: ${options.mint}`);
    console.log(`📊 Score: ${score.toFixed(4)} (${grade.toUpperCase()})`);
    console.log(`🔐 Proof hash: ${Buffer.from(proofHash).toString('hex')}`);
    
    // Call attest_token instruction
    const tx = await program.methods
      .attestToken(
        options.rulesetVersion,
        Math.round(score * 10000), // Convert to basis points
        gradeToNumber(grade),
        Array.from(proofHash)
      )
      .accounts({
        config: configPda,
        oracle: oraclePda,
        mint: mintPk,
        attestation: attestationPda,
        signer: wallet.publicKey,
        systemProgram: PublicKey.default,
      })
      .signers([wallet])
      .rpc();
    
    console.log(`✅ Attestation successful!`);
    console.log(`📝 Transaction: ${tx}`);
    console.log(`🏷️  Attestation PDA: ${attestationPda.toBase58()}`);
    
    return {
      transaction: tx,
      attestationPda: attestationPda.toBase58(),
      score,
      grade,
      proofHash: Buffer.from(proofHash).toString('hex')
    };
    
  } catch (error) {
    console.error('❌ Attestation failed:', error);
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log(`
Usage: npm run attest <mint> <ruleset_version> <rules_file> <endpoint> [keypair_path]

Example:
npm run attest So11111111111111111111111111111111111111112 1 ./rules.json https://api.devnet.solana.com ~/.config/solana/id.json
    `);
    process.exit(1);
  }
  
  const [mint, rulesetVersion, rulesFile, endpoint, keypairPath = '~/.config/solana/id.json'] = args;
  
  try {
    const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
    
    attestToken({
      mint,
      rulesetVersion: parseInt(rulesetVersion),
      rules,
      endpoint,
      keypairPath: keypairPath.replace('~', process.env.HOME || '')
    }).then(result => {
      console.log('🎉 Attestation completed:', result);
    }).catch(error => {
      console.error('💥 Error:', error);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('💥 CLI Error:', error);
    process.exit(1);
  }
}
