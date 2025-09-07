/**
 * SOLGuard API - Guard Routes
 * Public API endpoints for token verification status
 */

import { Router, Request, Response } from 'express';
import { AttestationMiddleware } from '../middleware/attestation';
import { createCanvas, loadImage } from 'canvas';
import { readFileSync } from 'fs';
import { join } from 'path';

export class GuardRoutes {
  private router: Router;
  private attestationMiddleware: AttestationMiddleware;

  constructor(attestationMiddleware: AttestationMiddleware) {
    this.router = Router();
    this.attestationMiddleware = attestationMiddleware;
    this.setupRoutes();
  }

  private setupRoutes() {
    // Get ABS token verification status
    this.router.get('/abs', this.getABSStatus.bind(this));
    
    // Get any token verification status
    this.router.get('/:mint', this.getTokenStatus.bind(this));
    
    // Generate OG image for token
    this.router.get('/og/:mint', this.generateOGImage.bind(this));
  }

  private async getABSStatus(req: Request, res: Response) {
    try {
      // ABS token mint address (placeholder - would be actual ABS mint)
      const ABS_MINT = 'ABSTokenMint1111111111111111111111111111111';
      
      const attestation = await this.attestationMiddleware.getAttestationInfo(ABS_MINT);
      
      // Enhanced response for ABS token
      const response = {
        success: true,
        token: 'ABS',
        mint: ABS_MINT,
        tsv1_verified: attestation.tsv1_verified,
        attestation: attestation.attestation,
        metadata: {
          name: 'Absolute Security Token',
          symbol: 'ABS',
          description: 'The security-first token powering the SOLGuard ecosystem',
          grade_description: this.getGradeDescription(attestation.attestation.grade),
          security_features: [
            'Multisig mint authority',
            'Null freeze authority', 
            'LP tokens time-locked',
            'Verified pool depth',
            'Whale distribution monitored',
            'Real-time security scanning'
          ]
        },
        ecosystem: {
          solguard_protocol: true,
          launchpad_integration: true,
          oracle_network: true,
          tsv1_compliant: true
        }
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error getting ABS status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get ABS verification status' 
      });
    }
  }

  private async getTokenStatus(req: Request, res: Response) {
    try {
      const { mint } = req.params;
      
      // Validate mint address format
      if (!mint || mint.length !== 44) {
        return res.status(400).json({
          success: false,
          error: 'Invalid mint address format'
        });
      }
      
      const attestation = await this.attestationMiddleware.getAttestationInfo(mint);
      
      const response = {
        success: true,
        mint,
        tsv1_verified: attestation.tsv1_verified,
        attestation: attestation.attestation,
        grade_description: this.getGradeDescription(attestation.attestation.grade),
        security_summary: this.getSecuritySummary(attestation.attestation.grade, attestation.attestation.score),
        verification_url: `https://solguard.tokenSOLver.com/verify/${mint}`,
        explorer_url: `https://explorer.solana.com/address/${mint}`
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error getting token status:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get token verification status' 
      });
    }
  }

  private async generateOGImage(req: Request, res: Response) {
    try {
      const { mint } = req.params;
      const { grade = 'red', score = '0.00' } = req.query;
      
      // Create canvas
      const width = 1200;
      const height = 630;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      
      // Background gradient based on grade
      const gradientColors = this.getGradientColors(grade as string);
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, gradientColors.start);
      gradient.addColorStop(1, gradientColors.end);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      
      // Add pattern overlay
      ctx.globalAlpha = 0.1;
      this.drawPattern(ctx, width, height);
      ctx.globalAlpha = 1;
      
      // SOLGuard branding
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('SOLGuard Protocol', width / 2, 100);
      
      ctx.font = '32px Arial';
      ctx.fillText('Token Security Verification', width / 2, 150);
      
      // Grade badge
      const badgeSize = 200;
      const badgeX = width / 2 - badgeSize / 2;
      const badgeY = 200;
      
      // Badge background
      ctx.fillStyle = this.getBadgeColor(grade as string);
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 20);
      ctx.fill();
      
      // Grade text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 72px Arial';
      ctx.textAlign = 'center';
      ctx.fillText((grade as string).toUpperCase(), width / 2, badgeY + 80);
      
      // Score
      ctx.font = '36px Arial';
      ctx.fillText(`${parseFloat(score as string).toFixed(2)}`, width / 2, badgeY + 130);
      
      // Token info
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '24px Arial';
      const shortMint = `${mint.slice(0, 8)}...${mint.slice(-8)}`;
      ctx.fillText(`Token: ${shortMint}`, width / 2, 480);
      
      // TSV-1 compliance
      ctx.font = '20px Arial';
      ctx.fillText('TSV-1 Security Standard', width / 2, 520);
      
      // Footer
      ctx.font = '18px Arial';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillText('Powered by TokenSOLver × ABS', width / 2, 580);
      
      // Convert to PNG buffer
      const buffer = canvas.toBuffer('image/png');
      
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.send(buffer);
      
    } catch (error) {
      console.error('Error generating OG image:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to generate OG image' 
      });
    }
  }

  private getGradeDescription(grade?: string): string {
    switch (grade?.toLowerCase()) {
      case 'green':
        return 'Excellent security - All critical security checks passed';
      case 'yellow':
        return 'Good security - Most security checks passed with minor issues';
      case 'red':
        return 'Poor security - Critical security issues detected';
      default:
        return 'Not verified - No SOLGuard attestation found';
    }
  }

  private getSecuritySummary(grade?: string, score?: number): object {
    const baseScore = score || 0;
    
    return {
      overall_grade: grade?.toUpperCase() || 'UNVERIFIED',
      security_score: baseScore,
      risk_level: this.getRiskLevel(grade),
      recommendation: this.getRecommendation(grade),
      last_updated: new Date().toISOString()
    };
  }

  private getRiskLevel(grade?: string): string {
    switch (grade?.toLowerCase()) {
      case 'green': return 'LOW';
      case 'yellow': return 'MEDIUM';
      case 'red': return 'HIGH';
      default: return 'UNKNOWN';
    }
  }

  private getRecommendation(grade?: string): string {
    switch (grade?.toLowerCase()) {
      case 'green': 
        return 'Token meets high security standards. Safe for trading with normal precautions.';
      case 'yellow': 
        return 'Token has good security but some minor issues. Exercise normal caution.';
      case 'red': 
        return 'Token has security concerns. High risk - trade with extreme caution or avoid.';
      default: 
        return 'Token not verified. Unknown security status - verify independently before trading.';
    }
  }

  private getGradientColors(grade: string): { start: string; end: string } {
    switch (grade.toLowerCase()) {
      case 'green':
        return { start: '#10B981', end: '#059669' }; // Green gradient
      case 'yellow':
        return { start: '#F59E0B', end: '#D97706' }; // Yellow gradient
      case 'red':
        return { start: '#EF4444', end: '#DC2626' }; // Red gradient
      default:
        return { start: '#6B7280', end: '#4B5563' }; // Gray gradient
    }
  }

  private getBadgeColor(grade: string): string {
    switch (grade.toLowerCase()) {
      case 'green': return '#10B981';
      case 'yellow': return '#F59E0B';
      case 'red': return '#EF4444';
      default: return '#6B7280';
    }
  }

  private drawPattern(ctx: CanvasRenderingContext2D, width: number, height: number) {
    // Draw hexagonal pattern
    const hexSize = 40;
    const hexHeight = hexSize * Math.sqrt(3);
    
    for (let y = 0; y < height + hexHeight; y += hexHeight * 0.75) {
      for (let x = 0; x < width + hexSize * 2; x += hexSize * 1.5) {
        const offsetX = (y / (hexHeight * 0.75)) % 2 === 1 ? hexSize * 0.75 : 0;
        this.drawHexagon(ctx, x + offsetX, y, hexSize);
      }
    }
  }

  private drawHexagon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const hexX = x + size * Math.cos(angle);
      const hexY = y + size * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(hexX, hexY);
      } else {
        ctx.lineTo(hexX, hexY);
      }
    }
    ctx.closePath();
    ctx.stroke();
  }

  getRouter(): Router {
    return this.router;
  }
}

export default GuardRoutes;
