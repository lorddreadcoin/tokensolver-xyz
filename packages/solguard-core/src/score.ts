/**
 * SOLGuard Protocol (TSV-1) Scoring Engine
 */

import { RuleResult, Grade, RuleId } from './types';
import { RULE_WEIGHTS, GRADE_THRESHOLDS } from './constants';

export interface ScoreResult {
  score: number;
  grade: Grade;
  passedRules: number;
  totalRules: number;
  weightedScore: number;
}

/**
 * Calculate score and grade from rule results
 */
export function gradeFromRules(rules: RuleResult[]): ScoreResult {
  const totalWeight = Object.values(RULE_WEIGHTS).reduce((a, b) => a + b, 0);
  
  const weightedScore = rules.reduce((sum, rule) => {
    const weight = RULE_WEIGHTS[rule.id as RuleId] || 0;
    return sum + (rule.passed ? weight : 0);
  }, 0);
  
  const score = Math.min(1, Math.max(0, weightedScore / totalWeight));
  
  const grade: Grade = score >= GRADE_THRESHOLDS.GREEN 
    ? 'green' 
    : score >= GRADE_THRESHOLDS.YELLOW 
    ? 'yellow' 
    : 'red';
  
  const passedRules = rules.filter(r => r.passed).length;
  
  return {
    score,
    grade,
    passedRules,
    totalRules: rules.length,
    weightedScore
  };
}

/**
 * Convert grade string to numeric value for on-chain storage
 */
export function gradeToNumber(grade: Grade): number {
  switch (grade) {
    case 'green': return 2;
    case 'yellow': return 1;
    case 'red': return 0;
    default: return 0;
  }
}

/**
 * Convert numeric grade back to string
 */
export function numberToGrade(num: number): Grade {
  switch (num) {
    case 2: return 'green';
    case 1: return 'yellow';
    case 0: return 'red';
    default: return 'red';
  }
}

/**
 * Check if a score meets the minimum grade requirement
 */
export function meetsMinGrade(score: number, minGrade: Grade): boolean {
  const grade = score >= GRADE_THRESHOLDS.GREEN 
    ? 'green' 
    : score >= GRADE_THRESHOLDS.YELLOW 
    ? 'yellow' 
    : 'red';
  
  const gradeValue = gradeToNumber(grade);
  const minValue = gradeToNumber(minGrade);
  
  return gradeValue >= minValue;
}

/**
 * Calculate risk score based on failed critical rules
 */
export function calculateRiskScore(rules: RuleResult[]): number {
  const criticalRules = ['R1', 'R2', 'R6', 'R8']; // High severity rules
  const failedCritical = rules.filter(r => 
    criticalRules.includes(r.id) && !r.passed
  ).length;
  
  const totalCritical = criticalRules.length;
  return failedCritical / totalCritical;
}
