// SOLGuard Module Optimizer - Information Theory Analysis
// Implements scientific module reduction strategy based on information gain

const AWS = require('aws-sdk');

// Module Efficiency Analysis Configuration
const OPTIMIZATION_CONFIG = {
  ANALYSIS_WINDOW_DAYS: 30,
  MIN_SAMPLES_FOR_ANALYSIS: 100,
  EFFICIENCY_THRESHOLD: 0.1, // Information gain per dollar
  REDUNDANCY_THRESHOLD: 0.8,  // Correlation threshold for redundancy
  COST_WEIGHTS: {
    PROCESSING_TIME: 0.0001,    // $0.0001 per ms (Lambda pricing approximation)
    API_CALL: 0.001,            // $0.001 per API call (average external API cost)
    MEMORY_USAGE: 0.00001       // $0.00001 per MB-second
  }
};

// Information Theory-Based Module Efficiency Analyzer
class ModuleOptimizer {
  constructor(dynamoTable) {
    this.dynamoClient = new AWS.DynamoDB.DocumentClient();
    this.tableName = dynamoTable;
    this.coreModules = [
      'security', 'liquidity', 'behavioral', 'market', 'competitive',
      'ecosystem', 'developer', 'tokenomics', 'social', 'narrative',
      'institutional', 'realtime', 'exit', 'education', 'protection'
    ];
  }

  async analyzeModuleEfficiency(timeWindowDays = 30) {
    const historicalData = await this.getHistoricalAnalysisData(timeWindowDays);
    
    if (historicalData.length < OPTIMIZATION_CONFIG.MIN_SAMPLES_FOR_ANALYSIS) {
      throw new Error(`Insufficient data: ${historicalData.length} samples, need ${OPTIMIZATION_CONFIG.MIN_SAMPLES_FOR_ANALYSIS}`);
    }

    const moduleMetrics = await Promise.all(
      this.coreModules.map(async moduleName => {
        const metrics = await this.calculateModuleMetrics(moduleName, historicalData);
        return { moduleName, ...metrics };
      })
    );

    // Calculate redundancy matrix
    const redundancyMatrix = this.calculateRedundancyMatrix(moduleMetrics, historicalData);
    
    // Rank modules by efficiency
    const rankedModules = this.rankModulesByEfficiency(moduleMetrics, redundancyMatrix);
    
    // Generate optimization recommendations
    const recommendations = this.generateOptimizationRecommendations(rankedModules, redundancyMatrix);

    return {
      analysisDate: new Date().toISOString(),
      dataWindow: `${timeWindowDays} days`,
      sampleSize: historicalData.length,
      moduleMetrics: rankedModules,
      redundancyMatrix,
      recommendations,
      estimatedCostSavings: this.calculateCostSavings(recommendations, moduleMetrics)
    };
  }

  async getHistoricalAnalysisData(timeWindowDays) {
    const cutoffTime = Date.now() - (timeWindowDays * 24 * 60 * 60 * 1000);
    
    try {
      const result = await this.dynamoClient.scan({
        TableName: this.tableName,
        FilterExpression: '#timestamp > :cutoff AND attribute_exists(actualOutcome)',
        ExpressionAttributeNames: {
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':cutoff': cutoffTime
        },
        ProjectionExpression: 'jobId, address, modules, finalResult, actualOutcome, #timestamp, processingMetrics'
      }).promise();

      return result.Items || [];
    } catch (error) {
      console.error('Failed to retrieve historical data:', error);
      return [];
    }
  }

  async calculateModuleMetrics(moduleName, historicalData) {
    const moduleData = historicalData
      .filter(item => item.modules && item.modules[moduleName])
      .map(item => ({
        prediction: item.modules[moduleName].result,
        actualOutcome: item.actualOutcome,
        processingTime: item.processingMetrics?.[moduleName]?.processingTime || 0,
        apiCalls: item.processingMetrics?.[moduleName]?.apiCalls || 0,
        memoryUsage: item.processingMetrics?.[moduleName]?.memoryUsage || 0
      }));

    if (moduleData.length === 0) {
      return this.getDefaultMetrics();
    }

    // Calculate information gain using mutual information
    const informationGain = this.calculateMutualInformation(
      moduleData.map(d => d.prediction?.score || 50),
      moduleData.map(d => d.actualOutcome?.riskMaterialized || false)
    );

    // Calculate computational cost
    const avgProcessingTime = moduleData.reduce((sum, d) => sum + d.processingTime, 0) / moduleData.length;
    const avgApiCalls = moduleData.reduce((sum, d) => sum + d.apiCalls, 0) / moduleData.length;
    const avgMemoryUsage = moduleData.reduce((sum, d) => sum + d.memoryUsage, 0) / moduleData.length;

    const computationalCost = 
      avgProcessingTime * OPTIMIZATION_CONFIG.COST_WEIGHTS.PROCESSING_TIME +
      avgApiCalls * OPTIMIZATION_CONFIG.COST_WEIGHTS.API_CALL +
      avgMemoryUsage * OPTIMIZATION_CONFIG.COST_WEIGHTS.MEMORY_USAGE;

    // Calculate prediction accuracy
    const accuracy = this.calculateAccuracy(
      moduleData.map(d => d.prediction?.score || 50),
      moduleData.map(d => d.actualOutcome?.riskMaterialized || false)
    );

    // Calculate error reduction contribution
    const errorReduction = this.calculateErrorReduction(moduleData);

    // Calculate efficiency (information per dollar)
    const efficiency = computationalCost > 0 ? informationGain / computationalCost : 0;

    return {
      informationGain,
      computationalCost,
      accuracy,
      errorReduction,
      efficiency,
      sampleSize: moduleData.length,
      avgProcessingTime,
      avgApiCalls,
      avgMemoryUsage
    };
  }

  calculateMutualInformation(predictions, outcomes) {
    // Discretize predictions into bins for MI calculation
    const predictionBins = this.discretizeValues(predictions, 4); // 4 risk levels
    const outcomeBins = outcomes.map(o => o ? 1 : 0); // Binary outcomes

    // Calculate joint and marginal probabilities
    const jointProbs = this.calculateJointProbabilities(predictionBins, outcomeBins);
    const marginalProbsX = this.calculateMarginalProbabilities(predictionBins);
    const marginalProbsY = this.calculateMarginalProbabilities(outcomeBins);

    // Calculate mutual information: I(X;Y) = Σ p(x,y) * log(p(x,y) / (p(x) * p(y)))
    let mutualInfo = 0;
    
    for (const [joint, prob] of jointProbs.entries()) {
      const [x, y] = joint.split(',').map(Number);
      const pX = marginalProbsX.get(x) || 0;
      const pY = marginalProbsY.get(y) || 0;
      
      if (prob > 0 && pX > 0 && pY > 0) {
        mutualInfo += prob * Math.log2(prob / (pX * pY));
      }
    }

    return Math.max(0, mutualInfo); // Ensure non-negative
  }

  discretizeValues(values, bins) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binSize = (max - min) / bins;
    
    return values.map(v => Math.min(bins - 1, Math.floor((v - min) / binSize)));
  }

  calculateJointProbabilities(xValues, yValues) {
    const jointCounts = new Map();
    const total = xValues.length;

    for (let i = 0; i < total; i++) {
      const key = `${xValues[i]},${yValues[i]}`;
      jointCounts.set(key, (jointCounts.get(key) || 0) + 1);
    }

    const jointProbs = new Map();
    for (const [key, count] of jointCounts.entries()) {
      jointProbs.set(key, count / total);
    }

    return jointProbs;
  }

  calculateMarginalProbabilities(values) {
    const counts = new Map();
    const total = values.length;

    values.forEach(v => {
      counts.set(v, (counts.get(v) || 0) + 1);
    });

    const probs = new Map();
    for (const [value, count] of counts.entries()) {
      probs.set(value, count / total);
    }

    return probs;
  }

  calculateAccuracy(predictions, outcomes) {
    if (predictions.length !== outcomes.length || predictions.length === 0) {
      return 0;
    }

    // Convert predictions to binary (risky vs safe) for accuracy calculation
    const binaryPredictions = predictions.map(p => p > 70); // Threshold for "risky"
    
    let correct = 0;
    for (let i = 0; i < binaryPredictions.length; i++) {
      if (binaryPredictions[i] === outcomes[i]) {
        correct++;
      }
    }

    return correct / predictions.length;
  }

  calculateErrorReduction(moduleData) {
    if (moduleData.length < 2) return 0;

    // Calculate baseline error (without this module)
    const baselineError = this.calculateBaselineError(moduleData);
    
    // Calculate error with this module
    const moduleError = this.calculateModuleError(moduleData);
    
    return Math.max(0, baselineError - moduleError);
  }

  calculateBaselineError(moduleData) {
    // Simple baseline: always predict neutral (50% risk)
    const baselinePredictions = moduleData.map(() => 50);
    const actualOutcomes = moduleData.map(d => d.actualOutcome?.riskScore || 50);
    
    return this.calculateMeanSquaredError(baselinePredictions, actualOutcomes);
  }

  calculateModuleError(moduleData) {
    const predictions = moduleData.map(d => d.prediction?.score || 50);
    const actualOutcomes = moduleData.map(d => d.actualOutcome?.riskScore || 50);
    
    return this.calculateMeanSquaredError(predictions, actualOutcomes);
  }

  calculateMeanSquaredError(predictions, actuals) {
    if (predictions.length !== actuals.length || predictions.length === 0) {
      return Infinity;
    }

    const sumSquaredErrors = predictions.reduce((sum, pred, i) => {
      const error = pred - actuals[i];
      return sum + (error * error);
    }, 0);

    return sumSquaredErrors / predictions.length;
  }

  calculateRedundancyMatrix(moduleMetrics, historicalData) {
    const matrix = {};
    
    for (let i = 0; i < this.coreModules.length; i++) {
      const moduleA = this.coreModules[i];
      matrix[moduleA] = {};
      
      for (let j = 0; j < this.coreModules.length; j++) {
        const moduleB = this.coreModules[j];
        
        if (i === j) {
          matrix[moduleA][moduleB] = 1.0; // Perfect correlation with self
        } else {
          matrix[moduleA][moduleB] = this.calculateModuleCorrelation(moduleA, moduleB, historicalData);
        }
      }
    }

    return matrix;
  }

  calculateModuleCorrelation(moduleA, moduleB, historicalData) {
    const pairsData = historicalData
      .filter(item => 
        item.modules?.[moduleA]?.result?.score !== undefined &&
        item.modules?.[moduleB]?.result?.score !== undefined
      )
      .map(item => ({
        scoreA: item.modules[moduleA].result.score,
        scoreB: item.modules[moduleB].result.score
      }));

    if (pairsData.length < 10) return 0; // Insufficient data for correlation

    return this.calculatePearsonCorrelation(
      pairsData.map(p => p.scoreA),
      pairsData.map(p => p.scoreB)
    );
  }

  calculatePearsonCorrelation(xValues, yValues) {
    if (xValues.length !== yValues.length || xValues.length === 0) {
      return 0;
    }

    const n = xValues.length;
    const meanX = xValues.reduce((sum, x) => sum + x, 0) / n;
    const meanY = yValues.reduce((sum, y) => sum + y, 0) / n;

    let numerator = 0;
    let sumSquaredX = 0;
    let sumSquaredY = 0;

    for (let i = 0; i < n; i++) {
      const deltaX = xValues[i] - meanX;
      const deltaY = yValues[i] - meanY;
      
      numerator += deltaX * deltaY;
      sumSquaredX += deltaX * deltaX;
      sumSquaredY += deltaY * deltaY;
    }

    const denominator = Math.sqrt(sumSquaredX * sumSquaredY);
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  rankModulesByEfficiency(moduleMetrics, redundancyMatrix) {
    return moduleMetrics
      .map(module => ({
        ...module,
        redundancyScore: this.calculateRedundancyScore(module.moduleName, redundancyMatrix),
        uniqueContribution: this.calculateUniqueContribution(module, redundancyMatrix)
      }))
      .sort((a, b) => {
        // Primary sort: efficiency (information per dollar)
        if (Math.abs(a.efficiency - b.efficiency) > 0.01) {
          return b.efficiency - a.efficiency;
        }
        // Secondary sort: unique contribution (lower redundancy is better)
        return a.redundancyScore - b.redundancyScore;
      });
  }

  calculateRedundancyScore(moduleName, redundancyMatrix) {
    const correlations = Object.values(redundancyMatrix[moduleName] || {});
    const otherModuleCorrelations = correlations.filter((_, i) => this.coreModules[i] !== moduleName);
    
    if (otherModuleCorrelations.length === 0) return 0;
    
    // Average correlation with other modules
    return otherModuleCorrelations.reduce((sum, corr) => sum + Math.abs(corr), 0) / otherModuleCorrelations.length;
  }

  calculateUniqueContribution(module, redundancyMatrix) {
    const redundancyScore = this.calculateRedundancyScore(module.moduleName, redundancyMatrix);
    
    // Unique contribution is inverse of redundancy, weighted by information gain
    return module.informationGain * (1 - redundancyScore);
  }

  generateOptimizationRecommendations(rankedModules, redundancyMatrix) {
    const recommendations = {
      coreModules: [],
      redundantModules: [],
      lowEfficiencyModules: [],
      optimizationStrategy: ''
    };

    // Identify core modules (high efficiency, low redundancy)
    recommendations.coreModules = rankedModules
      .filter(m => 
        m.efficiency >= OPTIMIZATION_CONFIG.EFFICIENCY_THRESHOLD &&
        m.redundancyScore < OPTIMIZATION_CONFIG.REDUNDANCY_THRESHOLD
      )
      .slice(0, 5) // Top 5 most efficient
      .map(m => ({
        name: m.moduleName,
        efficiency: m.efficiency,
        informationGain: m.informationGain,
        justification: `High efficiency (${m.efficiency.toFixed(4)}) with low redundancy (${m.redundancyScore.toFixed(2)})`
      }));

    // Identify redundant modules
    recommendations.redundantModules = rankedModules
      .filter(m => m.redundancyScore >= OPTIMIZATION_CONFIG.REDUNDANCY_THRESHOLD)
      .map(m => ({
        name: m.moduleName,
        redundancyScore: m.redundancyScore,
        correlatedWith: this.findHighlyCorrelatedModules(m.moduleName, redundancyMatrix),
        justification: `High redundancy (${m.redundancyScore.toFixed(2)}) with existing modules`
      }));

    // Identify low efficiency modules
    recommendations.lowEfficiencyModules = rankedModules
      .filter(m => m.efficiency < OPTIMIZATION_CONFIG.EFFICIENCY_THRESHOLD)
      .map(m => ({
        name: m.moduleName,
        efficiency: m.efficiency,
        cost: m.computationalCost,
        informationGain: m.informationGain,
        justification: `Low efficiency (${m.efficiency.toFixed(4)}) - high cost relative to information gain`
      }));

    // Generate optimization strategy
    recommendations.optimizationStrategy = this.generateOptimizationStrategy(recommendations);

    return recommendations;
  }

  findHighlyCorrelatedModules(moduleName, redundancyMatrix) {
    const correlations = redundancyMatrix[moduleName] || {};
    
    return Object.entries(correlations)
      .filter(([otherModule, correlation]) => 
        otherModule !== moduleName && 
        Math.abs(correlation) >= OPTIMIZATION_CONFIG.REDUNDANCY_THRESHOLD
      )
      .map(([otherModule, correlation]) => ({
        module: otherModule,
        correlation: correlation.toFixed(3)
      }));
  }

  generateOptimizationStrategy(recommendations) {
    const coreCount = recommendations.coreModules.length;
    const redundantCount = recommendations.redundantModules.length;
    const lowEfficiencyCount = recommendations.lowEfficiencyModules.length;

    let strategy = `Analysis of ${this.coreModules.length} modules reveals:\n\n`;
    
    strategy += `✅ Core Modules (${coreCount}): High efficiency, low redundancy\n`;
    strategy += recommendations.coreModules.map(m => `   • ${m.name}: ${m.justification}`).join('\n') + '\n\n';
    
    if (redundantCount > 0) {
      strategy += `🔄 Redundant Modules (${redundantCount}): Consider consolidation\n`;
      strategy += recommendations.redundantModules.map(m => `   • ${m.name}: ${m.justification}`).join('\n') + '\n\n';
    }
    
    if (lowEfficiencyCount > 0) {
      strategy += `⚠️  Low Efficiency Modules (${lowEfficiencyCount}): Optimize or remove\n`;
      strategy += recommendations.lowEfficiencyModules.map(m => `   • ${m.name}: ${m.justification}`).join('\n') + '\n\n';
    }

    strategy += `🎯 Recommendation: Deploy ${coreCount} core modules for optimal cost-efficiency ratio.`;
    
    return strategy;
  }

  calculateCostSavings(recommendations, moduleMetrics) {
    const currentCost = moduleMetrics.reduce((sum, m) => sum + m.computationalCost, 0);
    const optimizedCost = recommendations.coreModules.reduce((sum, coreModule) => {
      const metrics = moduleMetrics.find(m => m.moduleName === coreModule.name);
      return sum + (metrics?.computationalCost || 0);
    }, 0);

    const monthlySavings = (currentCost - optimizedCost) * 30 * 24 * 60; // Assuming 1 analysis per minute
    const annualSavings = monthlySavings * 12;

    return {
      currentMonthlyCost: currentCost * 30 * 24 * 60,
      optimizedMonthlyCost: optimizedCost * 30 * 24 * 60,
      monthlySavings,
      annualSavings,
      savingsPercentage: currentCost > 0 ? ((currentCost - optimizedCost) / currentCost) * 100 : 0
    };
  }

  getDefaultMetrics() {
    return {
      informationGain: 0,
      computationalCost: 0.001,
      accuracy: 0.5,
      errorReduction: 0,
      efficiency: 0,
      sampleSize: 0,
      avgProcessingTime: 1000,
      avgApiCalls: 1,
      avgMemoryUsage: 128
    };
  }
}

module.exports = {
  ModuleOptimizer,
  OPTIMIZATION_CONFIG
};
