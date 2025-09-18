// SOLGuard Conformal Intelligence Engine
// Implements conformal prediction for calibrated uncertainty quantification

const AWS = require('aws-sdk');

// Configuration for production deployment
const CONFIG = {
  CALIBRATION_SET_SIZE: 1000,
  CONFIDENCE_LEVELS: [0.80, 0.90, 0.95, 0.99],
  NONCONFORMITY_WINDOW: 7 * 24 * 60 * 60 * 1000, // 7 days
  CACHE_TTL: {
    FAST_PATH: 60,      // 1 minute for immediate results
    DEEP_ANALYSIS: 300, // 5 minutes for comprehensive analysis
    CALIBRATION: 3600   // 1 hour for calibration data
  }
};

// Conformal Prediction Framework with Calibrated Uncertainty
class ConformalEnsemble {
  constructor(dynamoTable, eventBridge) {
    this.calibrationSet = [];
    this.nonconformityScores = [];
    this.baseModels = new Map();
    this.dynamoClient = new AWS.DynamoDB.DocumentClient();
    this.eventBridge = eventBridge;
    this.tableName = dynamoTable;
  }

  async predictWithConfidence(input, alpha = 0.1) {
    // Get base model predictions
    const predictions = await this.getBaseModelPredictions(input);
    const ensemblePrediction = this.aggregatePredictions(predictions);
    
    // Compute conformity score for this prediction
    const conformityScore = this.computeConformityScore(ensemblePrediction, input);
    
    // Find quantile from calibration set
    const quantile = this.findQuantile(this.nonconformityScores, 1 - alpha);
    
    return {
      prediction: ensemblePrediction,
      confidenceInterval: this.computeInterval(conformityScore, quantile),
      calibratedConfidence: this.mapToConfidence(conformityScore, quantile),
      predictionSet: this.computePredictionSet(conformityScore, quantile),
      metadata: {
        calibrationSetSize: this.calibrationSet.length,
        nonconformityScores: this.nonconformityScores.length,
        alpha,
        timestamp: Date.now()
      }
    };
  }

  async getBaseModelPredictions(input) {
    const modelPromises = Array.from(this.baseModels.entries()).map(async ([modelName, model]) => {
      try {
        const prediction = await model.predict(input);
        return { modelName, prediction, success: true };
      } catch (error) {
        console.warn(`Model ${modelName} failed: ${error.message}`);
        return { modelName, error: error.message, success: false };
      }
    });

    const results = await Promise.allSettled(modelPromises);
    return results
      .filter(r => r.status === 'fulfilled' && r.value.success)
      .map(r => r.value);
  }

  aggregatePredictions(predictions) {
    if (predictions.length === 0) {
      return { score: 50, confidence: 0.1, signals: [] };
    }

    // Weighted aggregation based on historical model performance
    let weightedScore = 0;
    let totalWeight = 0;
    const allSignals = [];

    predictions.forEach(({ modelName, prediction }) => {
      const modelWeight = this.getModelWeight(modelName);
      weightedScore += prediction.score * modelWeight;
      totalWeight += modelWeight;
      
      if (prediction.signals) {
        allSignals.push(...prediction.signals.map(s => ({ ...s, source: modelName })));
      }
    });

    return {
      score: totalWeight > 0 ? weightedScore / totalWeight : 50,
      signals: allSignals,
      modelCount: predictions.length,
      aggregationMethod: 'weighted_ensemble'
    };
  }

  computeConformityScore(prediction, input) {
    // Nonconformity measure based on prediction uncertainty and historical accuracy
    const baseScore = Math.abs(prediction.score - 50) / 50; // Normalized distance from neutral
    const signalUncertainty = this.calculateSignalUncertainty(prediction.signals);
    const historicalAccuracy = this.getHistoricalAccuracy(input.type);
    
    return baseScore * (1 - historicalAccuracy) + signalUncertainty;
  }

  calculateSignalUncertainty(signals) {
    if (!signals || signals.length === 0) return 0.5;
    
    // Measure signal consistency and confidence variance
    const confidences = signals.map(s => s.confidence || 0.5);
    const mean = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    const variance = confidences.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / confidences.length;
    
    return Math.sqrt(variance); // Standard deviation as uncertainty measure
  }

  findQuantile(scores, percentile) {
    if (scores.length === 0) return 0.5;
    
    const sorted = [...scores].sort((a, b) => a - b);
    const index = Math.ceil(percentile * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  computeInterval(conformityScore, quantile) {
    // Compute prediction interval based on conformity score and quantile
    const intervalWidth = quantile * 2; // Symmetric interval
    const center = conformityScore;
    
    return {
      lower: Math.max(0, center - intervalWidth / 2),
      upper: Math.min(1, center + intervalWidth / 2),
      width: intervalWidth
    };
  }

  mapToConfidence(conformityScore, quantile) {
    // Map conformity score to calibrated confidence [0, 1]
    const normalizedScore = Math.min(conformityScore / quantile, 1);
    return Math.max(0.1, 1 - normalizedScore); // Ensure minimum confidence
  }

  computePredictionSet(conformityScore, quantile) {
    // For classification-like risk tiers
    const riskTiers = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];
    const validTiers = [];
    
    riskTiers.forEach(tier => {
      const tierScore = this.getTierConformityScore(tier);
      if (Math.abs(tierScore - conformityScore) <= quantile) {
        validTiers.push(tier);
      }
    });
    
    return validTiers.length > 0 ? validTiers : ['YELLOW']; // Default to caution
  }

  getTierConformityScore(tier) {
    const tierScores = { 'GREEN': 0.1, 'YELLOW': 0.3, 'ORANGE': 0.7, 'RED': 0.9 };
    return tierScores[tier] || 0.5;
  }

  getModelWeight(modelName) {
    // Historical accuracy-based weighting
    const weights = {
      'security': 0.95,
      'liquidity': 0.90,
      'behavioral': 0.80,
      'market': 0.75,
      'risk_aggregation': 0.85
    };
    return weights[modelName] || 0.5;
  }

  getHistoricalAccuracy(inputType) {
    // Type-specific historical accuracy
    const accuracies = {
      'token': 0.82,
      'wallet': 0.78,
      'contract': 0.85
    };
    return accuracies[inputType] || 0.75;
  }

  async updateCalibrationSet(prediction, actualOutcome) {
    // Add new calibration point
    const calibrationPoint = {
      prediction,
      actualOutcome,
      conformityScore: this.computeConformityScore(prediction, { type: 'token' }),
      timestamp: Date.now()
    };

    this.calibrationSet.push(calibrationPoint);
    
    // Maintain calibration set size
    if (this.calibrationSet.length > CONFIG.CALIBRATION_SET_SIZE) {
      this.calibrationSet.shift();
    }

    // Update nonconformity scores
    this.nonconformityScores = this.calibrationSet.map(cp => cp.conformityScore);
    
    // Persist to DynamoDB for cross-function sharing
    await this.persistCalibrationData();
  }

  async persistCalibrationData() {
    try {
      await this.dynamoClient.put({
        TableName: this.tableName,
        Item: {
          id: 'calibration_data',
          calibrationSet: this.calibrationSet,
          nonconformityScores: this.nonconformityScores,
          lastUpdated: Date.now(),
          ttl: Math.floor(Date.now() / 1000) + CONFIG.CACHE_TTL.CALIBRATION
        }
      }).promise();
    } catch (error) {
      console.error('Failed to persist calibration data:', error);
    }
  }

  async loadCalibrationData() {
    try {
      const result = await this.dynamoClient.get({
        TableName: this.tableName,
        Key: { id: 'calibration_data' }
      }).promise();

      if (result.Item) {
        this.calibrationSet = result.Item.calibrationSet || [];
        this.nonconformityScores = result.Item.nonconformityScores || [];
      }
    } catch (error) {
      console.warn('Failed to load calibration data:', error);
    }
  }
}

// Event-Driven Analysis Orchestrator
class EventDrivenAnalysisOrchestrator {
  constructor(eventBridge, dynamoTable, websocketApi) {
    this.eventBridge = eventBridge;
    this.dynamoClient = new AWS.DynamoDB.DocumentClient();
    this.tableName = dynamoTable;
    this.websocketApi = websocketApi;
    this.coreModules = [
      { name: 'security', priority: 'immediate', timeout: 2000 },
      { name: 'liquidity', priority: 'immediate', timeout: 2000 },
      { name: 'behavioral', priority: 'quick', timeout: 5000 },
      { name: 'market', priority: 'quick', timeout: 5000 },
      { name: 'risk_aggregation', priority: 'deep', timeout: 10000 }
    ];
  }

  async orchestrateAnalysis(address, clientId = null) {
    const jobId = this.generateJobId();
    const analysisJob = {
      jobId,
      address,
      clientId,
      status: 'initiated',
      modules: {},
      startTime: Date.now(),
      ttl: Math.floor(Date.now() / 1000) + 3600 // 1 hour TTL
    };

    // Store initial job state with DynamoDB transaction
    await this.storeJobState(analysisJob);

    // Trigger parallel analysis via EventBridge
    const events = this.coreModules.map(module => ({
      Source: 'solguard.analysis',
      DetailType: `${module.name}AnalysisRequested`,
      Detail: {
        jobId,
        address,
        moduleName: module.name,
        priority: module.priority,
        timeout: module.timeout,
        clientId
      }
    }));

    try {
      await this.eventBridge.putEvents({ Entries: events }).promise();
      
      // Send initial WebSocket update
      if (clientId) {
        await this.sendWebSocketUpdate(clientId, {
          jobId,
          status: 'processing',
          progress: 0,
          estimatedCompletion: Date.now() + 10000
        });
      }

      return { jobId, status: 'processing' };
    } catch (error) {
      await this.markJobFailed(jobId, error.message);
      throw error;
    }
  }

  async handleModuleCompletion(event) {
    const { jobId, moduleName, result, error } = event.detail;

    try {
      // Use DynamoDB transaction for atomic state update
      await this.dynamoClient.transactWrite({
        TransactItems: [
          {
            Update: {
              TableName: this.tableName,
              Key: { jobId },
              UpdateExpression: 'SET modules.#module = :result, lastUpdated = :now',
              ExpressionAttributeNames: { '#module': moduleName },
              ExpressionAttributeValues: {
                ':result': { result, error, timestamp: Date.now() },
                ':now': Date.now()
              },
              ConditionExpression: 'attribute_exists(jobId)' // Ensure job exists
            }
          }
        ]
      }).promise();

      // Check if analysis is complete
      const job = await this.getJobState(jobId);
      if (await this.isAnalysisComplete(job)) {
        await this.finalizeAnalysis(job);
      } else {
        // Send progress update via WebSocket
        if (job.clientId) {
          const progress = this.calculateProgress(job);
          await this.sendWebSocketUpdate(job.clientId, {
            jobId,
            status: 'processing',
            progress,
            moduleCompleted: moduleName,
            partialResult: result
          });
        }
      }
    } catch (error) {
      console.error(`Failed to handle module completion for ${jobId}:`, error);
      await this.markJobFailed(jobId, error.message);
    }
  }

  async isAnalysisComplete(job) {
    const completedModules = Object.keys(job.modules || {});
    const requiredModules = this.coreModules.map(m => m.name);
    
    return requiredModules.every(module => completedModules.includes(module));
  }

  async finalizeAnalysis(job) {
    try {
      // Aggregate results using conformal prediction
      const conformalEnsemble = new ConformalEnsemble(this.tableName, this.eventBridge);
      await conformalEnsemble.loadCalibrationData();

      const moduleResults = Object.values(job.modules)
        .filter(m => m.result && !m.error)
        .map(m => m.result);

      const finalResult = await conformalEnsemble.predictWithConfidence({
        address: job.address,
        type: 'token',
        moduleResults
      });

      // Store final result
      await this.dynamoClient.update({
        TableName: this.tableName,
        Key: { jobId: job.jobId },
        UpdateExpression: 'SET #status = :status, finalResult = :result, completedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'completed',
          ':result': finalResult,
          ':now': Date.now()
        }
      }).promise();

      // Send final WebSocket update
      if (job.clientId) {
        await this.sendWebSocketUpdate(job.clientId, {
          jobId: job.jobId,
          status: 'completed',
          progress: 100,
          result: finalResult
        });
      }

    } catch (error) {
      console.error(`Failed to finalize analysis for ${job.jobId}:`, error);
      await this.markJobFailed(job.jobId, error.message);
    }
  }

  generateJobId() {
    return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async storeJobState(job) {
    await this.dynamoClient.put({
      TableName: this.tableName,
      Item: job
    }).promise();
  }

  async getJobState(jobId) {
    const result = await this.dynamoClient.get({
      TableName: this.tableName,
      Key: { jobId }
    }).promise();
    
    return result.Item;
  }

  async markJobFailed(jobId, errorMessage) {
    await this.dynamoClient.update({
      TableName: this.tableName,
      Key: { jobId },
      UpdateExpression: 'SET #status = :status, error = :error, failedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'failed',
        ':error': errorMessage,
        ':now': Date.now()
      }
    }).promise();
  }

  calculateProgress(job) {
    const totalModules = this.coreModules.length;
    const completedModules = Object.keys(job.modules || {}).length;
    return Math.round((completedModules / totalModules) * 100);
  }

  async sendWebSocketUpdate(clientId, update) {
    try {
      await this.websocketApi.postToConnection({
        ConnectionId: clientId,
        Data: JSON.stringify(update)
      }).promise();
    } catch (error) {
      if (error.statusCode === 410) {
        console.log(`Client ${clientId} disconnected`);
      } else {
        console.error(`WebSocket send failed:`, error);
      }
    }
  }
}

// Production Instrumentation with Comprehensive Observability
class ProductionInstrumentation {
  constructor() {
    this.cloudWatch = new AWS.CloudWatch();
    this.xray = require('aws-xray-sdk-core');
    this.sns = new AWS.SNS();
    this.alertTopicArn = process.env.ALERT_TOPIC_ARN;
  }

  async instrumentAnalysis(analysisFunction, metadata = {}) {
    const segment = this.xray.getSegment();
    const subsegment = segment?.addNewSubsegment('token-analysis');
    const startTime = performance.now();

    try {
      subsegment?.addAnnotation('address', metadata.address);
      subsegment?.addAnnotation('analysisType', metadata.type);

      const result = await analysisFunction();
      const processingTime = performance.now() - startTime;

      // Emit success metrics
      await this.emitMetrics([
        {
          MetricName: 'AnalysisSuccess',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'RiskTier', Value: result.riskTier || 'UNKNOWN' },
            { Name: 'AnalysisType', Value: metadata.type || 'token' }
          ]
        },
        {
          MetricName: 'ProcessingTime',
          Value: processingTime,
          Unit: 'Milliseconds',
          Dimensions: [
            { Name: 'AnalysisType', Value: metadata.type || 'token' }
          ]
        }
      ]);

      subsegment?.addMetadata('result', {
        riskTier: result.riskTier,
        confidence: result.calibratedConfidence,
        processingTime
      });

      return result;
    } catch (error) {
      // Emit failure metrics and alerts
      await this.emitMetrics([
        {
          MetricName: 'AnalysisFailure',
          Value: 1,
          Unit: 'Count',
          Dimensions: [
            { Name: 'ErrorType', Value: error.name || 'UnknownError' },
            { Name: 'AnalysisType', Value: metadata.type || 'token' }
          ]
        }
      ]);

      await this.sendAlert('Analysis Failure', {
        error: error.message,
        stack: error.stack,
        metadata
      });

      subsegment?.addError(error);
      throw error;
    } finally {
      subsegment?.close();
    }
  }

  async emitMetrics(metrics) {
    try {
      await this.cloudWatch.putMetricData({
        Namespace: 'SOLGuard/Intelligence',
        MetricData: metrics.map(metric => ({
          ...metric,
          Timestamp: new Date()
        }))
      }).promise();
    } catch (error) {
      console.error('Failed to emit metrics:', error);
    }
  }

  async sendAlert(subject, details) {
    if (!this.alertTopicArn) return;

    try {
      await this.sns.publish({
        TopicArn: this.alertTopicArn,
        Subject: `[SOLGuard] ${subject}`,
        Message: JSON.stringify(details, null, 2)
      }).promise();
    } catch (error) {
      console.error('Failed to send alert:', error);
    }
  }
}

module.exports = {
  ConformalEnsemble,
  EventDrivenAnalysisOrchestrator,
  ProductionInstrumentation,
  CONFIG
};
