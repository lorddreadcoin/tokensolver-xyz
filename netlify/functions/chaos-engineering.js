// SOLGuard Chaos Engineering Framework
// Implements automated failure injection for distributed system testing

const AWS = require('aws-sdk');

// Chaos Engineering Configuration
const CHAOS_CONFIG = {
  FAILURE_MODES: {
    LAMBDA_TIMEOUT: { probability: 0.1, duration: 5000 },
    API_RATE_LIMIT: { probability: 0.15, duration: 30000 },
    DYNAMODB_THROTTLE: { probability: 0.05, duration: 10000 },
    NETWORK_PARTITION: { probability: 0.08, duration: 15000 },
    MEMORY_PRESSURE: { probability: 0.12, duration: 8000 },
    CIRCUIT_BREAKER_TRIP: { probability: 0.2, duration: 60000 }
  },
  BLAST_RADIUS: {
    CANARY: 0.01,    // 1% of traffic
    SMALL: 0.05,     // 5% of traffic  
    MEDIUM: 0.10,    // 10% of traffic
    LARGE: 0.25      // 25% of traffic (max for production)
  },
  SAFETY_LIMITS: {
    MAX_CONCURRENT_EXPERIMENTS: 3,
    MAX_ERROR_RATE_INCREASE: 0.05, // 5% increase in error rate
    MIN_SUCCESS_RATE: 0.90,        // 90% minimum success rate
    EXPERIMENT_TIMEOUT: 300000     // 5 minutes max experiment duration
  }
};

// Chaos Engineering Experiment Framework
class ChaosExperiment {
  constructor(name, description, failureMode, blastRadius = 'CANARY') {
    this.id = this.generateExperimentId();
    this.name = name;
    this.description = description;
    this.failureMode = failureMode;
    this.blastRadius = blastRadius;
    this.status = 'CREATED';
    this.startTime = null;
    this.endTime = null;
    this.metrics = {
      totalRequests: 0,
      failedRequests: 0,
      successRate: 1.0,
      avgResponseTime: 0,
      errorsByType: {}
    };
    this.safetyChecks = [];
  }

  generateExperimentId() {
    return `chaos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async execute(targetFunction, monitoringCallback) {
    this.status = 'RUNNING';
    this.startTime = Date.now();

    try {
      // Pre-experiment safety checks
      await this.performSafetyChecks();

      // Start monitoring
      const monitoringInterval = setInterval(async () => {
        await this.collectMetrics();
        await monitoringCallback(this.metrics);
        
        // Check safety limits
        if (await this.shouldAbortExperiment()) {
          clearInterval(monitoringInterval);
          await this.abortExperiment('Safety limits exceeded');
          return;
        }
      }, 5000); // Monitor every 5 seconds

      // Execute chaos injection
      await this.injectFailure(targetFunction);

      // Wait for experiment duration
      await this.waitForCompletion();

      clearInterval(monitoringInterval);
      this.status = 'COMPLETED';
      this.endTime = Date.now();

      return this.generateReport();
    } catch (error) {
      this.status = 'FAILED';
      this.endTime = Date.now();
      throw new Error(`Chaos experiment failed: ${error.message}`);
    }
  }

  async performSafetyChecks() {
    const checks = [
      this.checkSystemHealth(),
      this.checkConcurrentExperiments(),
      this.checkBusinessHours(),
      this.checkDeploymentStatus()
    ];

    const results = await Promise.allSettled(checks);
    
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        throw new Error(`Safety check ${index + 1} failed: ${result.reason}`);
      }
      this.safetyChecks.push(result.value);
    });
  }

  async checkSystemHealth() {
    // Check baseline system health metrics
    const cloudWatch = new AWS.CloudWatch();
    
    const metrics = await cloudWatch.getMetricStatistics({
      Namespace: 'SOLGuard/Intelligence',
      MetricName: 'AnalysisSuccess',
      StartTime: new Date(Date.now() - 300000), // Last 5 minutes
      EndTime: new Date(),
      Period: 300,
      Statistics: ['Average']
    }).promise();

    const currentSuccessRate = metrics.Datapoints.length > 0 
      ? metrics.Datapoints[0].Average 
      : 0.95; // Default to healthy if no data

    if (currentSuccessRate < CHAOS_CONFIG.SAFETY_LIMITS.MIN_SUCCESS_RATE) {
      throw new Error(`System unhealthy: ${currentSuccessRate} success rate`);
    }

    return { check: 'system_health', status: 'PASS', value: currentSuccessRate };
  }

  async checkConcurrentExperiments() {
    // Check for other running chaos experiments
    const dynamoClient = new AWS.DynamoDB.DocumentClient();
    
    const result = await dynamoClient.scan({
      TableName: 'solguard-chaos-experiments',
      FilterExpression: '#status = :running',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':running': 'RUNNING' }
    }).promise();

    const runningExperiments = result.Items?.length || 0;
    
    if (runningExperiments >= CHAOS_CONFIG.SAFETY_LIMITS.MAX_CONCURRENT_EXPERIMENTS) {
      throw new Error(`Too many concurrent experiments: ${runningExperiments}`);
    }

    return { check: 'concurrent_experiments', status: 'PASS', value: runningExperiments };
  }

  async checkBusinessHours() {
    // Avoid chaos experiments during peak business hours
    const now = new Date();
    const hour = now.getUTCHours();
    
    // Peak hours: 14:00-22:00 UTC (covers US business hours)
    const isPeakHours = hour >= 14 && hour <= 22;
    
    if (isPeakHours && this.blastRadius !== 'CANARY') {
      throw new Error(`Cannot run non-canary experiments during peak hours (${hour}:00 UTC)`);
    }

    return { check: 'business_hours', status: 'PASS', value: { hour, isPeakHours } };
  }

  async checkDeploymentStatus() {
    // Check if there are any ongoing deployments
    const codeDeploy = new AWS.CodeDeploy();
    
    try {
      const deployments = await codeDeploy.listDeployments({
        applicationName: 'solguard-intelligence',
        deploymentGroupName: 'production',
        includeOnlyStatuses: ['InProgress', 'Queued', 'Ready']
      }).promise();

      if (deployments.deployments && deployments.deployments.length > 0) {
        throw new Error(`Active deployment in progress: ${deployments.deployments[0]}`);
      }
    } catch (error) {
      if (error.code !== 'ApplicationDoesNotExistException') {
        throw error;
      }
    }

    return { check: 'deployment_status', status: 'PASS', value: 'no_active_deployments' };
  }

  async injectFailure(targetFunction) {
    const failureConfig = CHAOS_CONFIG.FAILURE_MODES[this.failureMode];
    const shouldInjectFailure = Math.random() < failureConfig.probability;

    if (!shouldInjectFailure) {
      console.log(`Chaos injection skipped for ${this.failureMode} (probability: ${failureConfig.probability})`);
      return;
    }

    console.log(`Injecting ${this.failureMode} failure for ${failureConfig.duration}ms`);

    switch (this.failureMode) {
      case 'LAMBDA_TIMEOUT':
        await this.injectLambdaTimeout(targetFunction, failureConfig.duration);
        break;
      case 'API_RATE_LIMIT':
        await this.injectApiRateLimit(targetFunction, failureConfig.duration);
        break;
      case 'DYNAMODB_THROTTLE':
        await this.injectDynamoDbThrottle(targetFunction, failureConfig.duration);
        break;
      case 'NETWORK_PARTITION':
        await this.injectNetworkPartition(targetFunction, failureConfig.duration);
        break;
      case 'MEMORY_PRESSURE':
        await this.injectMemoryPressure(targetFunction, failureConfig.duration);
        break;
      case 'CIRCUIT_BREAKER_TRIP':
        await this.injectCircuitBreakerTrip(targetFunction, failureConfig.duration);
        break;
      default:
        throw new Error(`Unknown failure mode: ${this.failureMode}`);
    }
  }

  async injectLambdaTimeout(targetFunction, duration) {
    // Simulate Lambda timeout by introducing artificial delays
    const originalTimeout = targetFunction.timeout;
    
    targetFunction.timeout = Math.min(duration, originalTimeout * 0.8);
    
    setTimeout(() => {
      targetFunction.timeout = originalTimeout;
    }, duration);
  }

  async injectApiRateLimit(targetFunction, duration) {
    // Simulate API rate limiting by rejecting requests
    const originalApiCall = targetFunction.makeApiCall;
    
    targetFunction.makeApiCall = async (...args) => {
      if (Math.random() < 0.7) { // 70% chance of rate limit
        throw new Error('API_RATE_LIMIT_EXCEEDED');
      }
      return await originalApiCall.apply(targetFunction, args);
    };

    setTimeout(() => {
      targetFunction.makeApiCall = originalApiCall;
    }, duration);
  }

  async injectDynamoDbThrottle(targetFunction, duration) {
    // Simulate DynamoDB throttling
    const originalDynamoCall = targetFunction.dynamoClient.send;
    
    targetFunction.dynamoClient.send = async (command) => {
      if (Math.random() < 0.5) { // 50% chance of throttle
        const error = new Error('ProvisionedThroughputExceededException');
        error.code = 'ProvisionedThroughputExceededException';
        throw error;
      }
      return await originalDynamoCall.call(targetFunction.dynamoClient, command);
    };

    setTimeout(() => {
      targetFunction.dynamoClient.send = originalDynamoCall;
    }, duration);
  }

  async injectNetworkPartition(targetFunction, duration) {
    // Simulate network partition by introducing random delays and failures
    const originalNetworkCall = targetFunction.makeNetworkRequest;
    
    targetFunction.makeNetworkRequest = async (...args) => {
      // Random delay between 1-10 seconds
      const delay = Math.random() * 9000 + 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      if (Math.random() < 0.3) { // 30% chance of network failure
        throw new Error('NETWORK_UNREACHABLE');
      }
      
      return await originalNetworkCall.apply(targetFunction, args);
    };

    setTimeout(() => {
      targetFunction.makeNetworkRequest = originalNetworkCall;
    }, duration);
  }

  async injectMemoryPressure(targetFunction, duration) {
    // Simulate memory pressure by allocating large objects
    const memoryHog = [];
    const interval = setInterval(() => {
      // Allocate 10MB chunks
      memoryHog.push(new Array(10 * 1024 * 1024).fill('x'));
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);
      memoryHog.length = 0; // Clear memory
    }, duration);
  }

  async injectCircuitBreakerTrip(targetFunction, duration) {
    // Force circuit breaker to open state
    if (targetFunction.circuitBreaker) {
      const originalState = targetFunction.circuitBreaker.state;
      targetFunction.circuitBreaker.state = 'OPEN';
      targetFunction.circuitBreaker.lastFailureTime = Date.now();
      
      setTimeout(() => {
        targetFunction.circuitBreaker.state = originalState;
      }, duration);
    }
  }

  async collectMetrics() {
    // Collect real-time metrics during experiment
    const cloudWatch = new AWS.CloudWatch();
    
    try {
      const metrics = await cloudWatch.getMetricStatistics({
        Namespace: 'SOLGuard/Intelligence',
        MetricName: 'AnalysisSuccess',
        StartTime: new Date(this.startTime),
        EndTime: new Date(),
        Period: 60,
        Statistics: ['Sum', 'SampleCount', 'Average']
      }).promise();

      if (metrics.Datapoints.length > 0) {
        const latest = metrics.Datapoints[metrics.Datapoints.length - 1];
        this.metrics.totalRequests = latest.SampleCount;
        this.metrics.successRate = latest.Average;
        this.metrics.failedRequests = latest.SampleCount * (1 - latest.Average);
      }
    } catch (error) {
      console.warn('Failed to collect metrics:', error.message);
    }
  }

  async shouldAbortExperiment() {
    // Check if experiment should be aborted due to safety limits
    const currentErrorRate = 1 - this.metrics.successRate;
    const baselineErrorRate = 0.05; // Assume 5% baseline error rate
    const errorRateIncrease = currentErrorRate - baselineErrorRate;

    if (errorRateIncrease > CHAOS_CONFIG.SAFETY_LIMITS.MAX_ERROR_RATE_INCREASE) {
      return true;
    }

    if (this.metrics.successRate < CHAOS_CONFIG.SAFETY_LIMITS.MIN_SUCCESS_RATE) {
      return true;
    }

    const experimentDuration = Date.now() - this.startTime;
    if (experimentDuration > CHAOS_CONFIG.SAFETY_LIMITS.EXPERIMENT_TIMEOUT) {
      return true;
    }

    return false;
  }

  async abortExperiment(reason) {
    this.status = 'ABORTED';
    this.endTime = Date.now();
    
    console.error(`Chaos experiment ${this.id} aborted: ${reason}`);
    
    // Send alert
    const sns = new AWS.SNS();
    await sns.publish({
      TopicArn: process.env.ALERT_TOPIC_ARN,
      Subject: '[SOLGuard] Chaos Experiment Aborted',
      Message: JSON.stringify({
        experimentId: this.id,
        name: this.name,
        reason,
        metrics: this.metrics,
        duration: this.endTime - this.startTime
      }, null, 2)
    }).promise();
  }

  async waitForCompletion() {
    const experimentDuration = CHAOS_CONFIG.FAILURE_MODES[this.failureMode].duration;
    return new Promise(resolve => setTimeout(resolve, experimentDuration));
  }

  generateReport() {
    const duration = this.endTime - this.startTime;
    
    return {
      experimentId: this.id,
      name: this.name,
      description: this.description,
      failureMode: this.failureMode,
      blastRadius: this.blastRadius,
      status: this.status,
      duration,
      metrics: this.metrics,
      safetyChecks: this.safetyChecks,
      insights: this.generateInsights(),
      recommendations: this.generateRecommendations()
    };
  }

  generateInsights() {
    const insights = [];
    
    if (this.metrics.successRate < 0.95) {
      insights.push({
        type: 'RESILIENCE_GAP',
        severity: 'HIGH',
        description: `System success rate dropped to ${(this.metrics.successRate * 100).toFixed(1)}% during ${this.failureMode} injection`,
        impact: 'Service degradation under failure conditions'
      });
    }

    if (this.metrics.avgResponseTime > 5000) {
      insights.push({
        type: 'PERFORMANCE_DEGRADATION',
        severity: 'MEDIUM',
        description: `Average response time increased to ${this.metrics.avgResponseTime}ms`,
        impact: 'User experience degradation under stress'
      });
    }

    if (this.status === 'ABORTED') {
      insights.push({
        type: 'SAFETY_ABORT',
        severity: 'CRITICAL',
        description: 'Experiment aborted due to safety limits',
        impact: 'System may not be resilient enough for production chaos engineering'
      });
    }

    return insights;
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.metrics.successRate < 0.95) {
      recommendations.push({
        priority: 'HIGH',
        category: 'RESILIENCE',
        action: 'Implement additional circuit breakers and retry mechanisms',
        rationale: 'Low success rate indicates insufficient fault tolerance'
      });
    }

    if (this.failureMode === 'API_RATE_LIMIT' && this.metrics.failedRequests > 10) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'RATE_LIMITING',
        action: 'Implement exponential backoff with jitter for API calls',
        rationale: 'High failure rate during API rate limiting simulation'
      });
    }

    if (this.failureMode === 'DYNAMODB_THROTTLE' && this.metrics.successRate < 0.90) {
      recommendations.push({
        priority: 'HIGH',
        category: 'DATABASE',
        action: 'Increase DynamoDB provisioned capacity or implement adaptive scaling',
        rationale: 'Poor performance during database throttling indicates capacity issues'
      });
    }

    return recommendations;
  }
}

// Chaos Engineering Test Suite
class ChaosTestSuite {
  constructor() {
    this.experiments = [];
    this.dynamoClient = new AWS.DynamoDB.DocumentClient();
    this.tableName = 'solguard-chaos-experiments';
  }

  async runFullTestSuite(targetSystem) {
    console.log('Starting SOLGuard Chaos Engineering Test Suite...');
    
    const experimentConfigs = [
      {
        name: 'Lambda Timeout Resilience',
        description: 'Test system behavior under Lambda timeout conditions',
        failureMode: 'LAMBDA_TIMEOUT',
        blastRadius: 'CANARY'
      },
      {
        name: 'API Rate Limit Handling',
        description: 'Test graceful degradation under API rate limiting',
        failureMode: 'API_RATE_LIMIT',
        blastRadius: 'SMALL'
      },
      {
        name: 'DynamoDB Throttle Recovery',
        description: 'Test system recovery from database throttling',
        failureMode: 'DYNAMODB_THROTTLE',
        blastRadius: 'CANARY'
      },
      {
        name: 'Network Partition Tolerance',
        description: 'Test system behavior during network issues',
        failureMode: 'NETWORK_PARTITION',
        blastRadius: 'CANARY'
      },
      {
        name: 'Memory Pressure Handling',
        description: 'Test system stability under memory pressure',
        failureMode: 'MEMORY_PRESSURE',
        blastRadius: 'CANARY'
      },
      {
        name: 'Circuit Breaker Effectiveness',
        description: 'Test circuit breaker pattern implementation',
        failureMode: 'CIRCUIT_BREAKER_TRIP',
        blastRadius: 'SMALL'
      }
    ];

    const results = [];
    
    for (const config of experimentConfigs) {
      try {
        console.log(`Running experiment: ${config.name}`);
        
        const experiment = new ChaosExperiment(
          config.name,
          config.description,
          config.failureMode,
          config.blastRadius
        );

        const result = await experiment.execute(targetSystem, async (metrics) => {
          console.log(`Experiment ${config.name} metrics:`, metrics);
        });

        await this.persistExperimentResult(result);
        results.push(result);
        
        // Wait between experiments to avoid interference
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 second pause
        
      } catch (error) {
        console.error(`Experiment ${config.name} failed:`, error.message);
        results.push({
          name: config.name,
          status: 'ERROR',
          error: error.message
        });
      }
    }

    return this.generateSuiteReport(results);
  }

  async persistExperimentResult(result) {
    try {
      await this.dynamoClient.put({
        TableName: this.tableName,
        Item: {
          ...result,
          timestamp: Date.now(),
          ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
        }
      }).promise();
    } catch (error) {
      console.error('Failed to persist experiment result:', error);
    }
  }

  generateSuiteReport(results) {
    const totalExperiments = results.length;
    const successfulExperiments = results.filter(r => r.status === 'COMPLETED').length;
    const abortedExperiments = results.filter(r => r.status === 'ABORTED').length;
    const failedExperiments = results.filter(r => r.status === 'ERROR').length;

    const overallInsights = this.aggregateInsights(results);
    const prioritizedRecommendations = this.prioritizeRecommendations(results);

    return {
      suiteId: `chaos_suite_${Date.now()}`,
      timestamp: new Date().toISOString(),
      summary: {
        totalExperiments,
        successfulExperiments,
        abortedExperiments,
        failedExperiments,
        successRate: successfulExperiments / totalExperiments
      },
      experiments: results,
      overallInsights,
      prioritizedRecommendations,
      systemResilienceScore: this.calculateResilienceScore(results)
    };
  }

  aggregateInsights(results) {
    const allInsights = results
      .filter(r => r.insights)
      .flatMap(r => r.insights);

    const insightsByType = allInsights.reduce((acc, insight) => {
      acc[insight.type] = acc[insight.type] || [];
      acc[insight.type].push(insight);
      return acc;
    }, {});

    return Object.entries(insightsByType).map(([type, insights]) => ({
      type,
      count: insights.length,
      severity: insights.reduce((max, i) => 
        i.severity === 'CRITICAL' ? 'CRITICAL' : 
        i.severity === 'HIGH' && max !== 'CRITICAL' ? 'HIGH' : max, 'LOW'),
      description: `${insights.length} experiments revealed ${type.toLowerCase()} issues`
    }));
  }

  prioritizeRecommendations(results) {
    const allRecommendations = results
      .filter(r => r.recommendations)
      .flatMap(r => r.recommendations);

    return allRecommendations
      .sort((a, b) => {
        const priorityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      })
      .slice(0, 10); // Top 10 recommendations
  }

  calculateResilienceScore(results) {
    const weights = {
      'COMPLETED': 10,
      'ABORTED': 5,
      'ERROR': 0
    };

    const totalScore = results.reduce((sum, result) => {
      return sum + (weights[result.status] || 0);
    }, 0);

    const maxPossibleScore = results.length * 10;
    
    return Math.round((totalScore / maxPossibleScore) * 100);
  }
}

module.exports = {
  ChaosExperiment,
  ChaosTestSuite,
  CHAOS_CONFIG
};
