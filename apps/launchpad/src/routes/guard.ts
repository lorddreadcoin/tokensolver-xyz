/**
 * SOLGuard API - Guard Routes
 * Public API endpoints for token verification status
 */

import { Router, Request, Response } from 'express';
import { AttestationMiddleware } from '../middleware/attestation';
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
      
      // Generate placeholder image (canvas functionality removed)
      const imageData = this.generatePlaceholderImage(grade as string, parseFloat(score as string));
      
      // Return SVG image directly
      const svgData = Buffer.from(imageData.split(',')[1], 'base64').toString();
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.send(svgData);
      
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

  // Canvas functionality removed - can be re-added later with proper setup
  private generatePlaceholderImage(grade: string, score: number): string {
    // Return a simple SVG as base64 for now
    const color = this.getBadgeColor(grade);
    const svg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${color}"/>
        <text x="50%" y="50%" text-anchor="middle" dy=".3em" 
              font-family="Arial, sans-serif" font-size="48" fill="white">
          SOLGuard ${grade.toUpperCase()} - Score: ${(score * 100).toFixed(1)}%
        </text>
      </svg>
    `;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  getRouter(): Router {
    return this.router;
  }
}

export default GuardRoutes;
