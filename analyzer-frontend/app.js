const API_BASE = '/.netlify/functions';

const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');

async function api(path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function setError(msg) {
  const el = $('error');
  el.textContent = msg;
  show('error');
}

function clearError() {
  $('error').textContent = '';
  hide('error');
}

function renderScore(score) {
  // Transform boring score into visceral threat visualization
  if (score.signals && score.signals.length > 0) {
    renderThreatRadar(score, score.signals);
    renderIntelligenceStory(score.signals);
    
    // Check for manipulation patterns
    const manipulationRisk = score.manipulationRisk || 'NONE';
    if (manipulationRisk === 'HIGH' || manipulationRisk === 'MEDIUM') {
      showManipulationDetection(score);
    }
  } else {
    // Fallback to enhanced score display
    renderEnhancedScore(score);
  }
  
  show('score-card');
}

function renderThreatRadar(score, signals) {
  const container = document.getElementById('threat-radar') || createThreatRadarContainer();
  
  // Extract critical threats from signals
  const threats = signals
    .filter(s => s.tier === 'RED' || s.tier === 'ORANGE')
    .slice(0, 8) // Max 8 threats on radar
    .map((s, index) => ({
      angle: (index * 45) + Math.random() * 20 - 10, // Spread around radar with jitter
      distance: Math.min(0.8, 1 - s.confidence), // Distance from center based on confidence
      label: s.type.replace(/_/g, ' ').toLowerCase(),
      color: s.tier === 'RED' ? '#ff4444' : '#ff8800',
      severity: s.tier,
      confidence: s.confidence,
      reason: s.reason
    }));

  const riskLevel = score.score < 30 ? 'CRITICAL' : score.score < 60 ? 'HIGH' : 'MEDIUM';
  const radarColor = riskLevel === 'CRITICAL' ? '#ff4444' : riskLevel === 'HIGH' ? '#ff8800' : '#ffaa00';

  container.innerHTML = `
    <div class="threat-radar-container ${riskLevel.toLowerCase()}-risk">
      <div class="radar-title">🎯 THREAT RADAR</div>
      <svg class="threat-radar" viewBox="0 0 400 400">
        <!-- Radar rings -->
        <circle cx="200" cy="200" r="50" fill="none" stroke="${radarColor}" stroke-width="1" opacity="0.3"/>
        <circle cx="200" cy="200" r="100" fill="none" stroke="${radarColor}" stroke-width="1" opacity="0.3"/>
        <circle cx="200" cy="200" r="150" fill="none" stroke="${radarColor}" stroke-width="1" opacity="0.3"/>
        
        <!-- Radar sweep -->
        <line x1="200" y1="200" x2="200" y2="50" stroke="${radarColor}" stroke-width="2" opacity="0.6" class="radar-sweep"/>
        <line x1="200" y1="200" x2="350" y2="200" stroke="${radarColor}" stroke-width="2" opacity="0.6" class="radar-sweep"/>
        
        <!-- Center dot -->
        <circle cx="200" cy="200" r="5" fill="${radarColor}" class="radar-center"/>
        
        <!-- Threat dots -->
        ${threats.map((t, i) => {
          const x = 200 + Math.cos(t.angle * Math.PI / 180) * t.distance * 150;
          const y = 200 + Math.sin(t.angle * Math.PI / 180) * t.distance * 150;
          return `
            <g class="threat-group" data-threat="${t.label}">
              <circle 
                cx="${x}" cy="${y}" r="8" 
                fill="${t.color}" 
                class="threat-pulse ${t.severity.toLowerCase()}"
                data-confidence="${(t.confidence * 100).toFixed(0)}"
              >
                <animate attributeName="r" values="8;15;8" dur="2s" repeatCount="indefinite" begin="${i * 0.3}s"/>
                <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="${i * 0.3}s"/>
              </circle>
              <text x="${x}" y="${y - 20}" text-anchor="middle" fill="${t.color}" font-size="10" class="threat-label">
                ${t.label}
              </text>
            </g>
          `;
        }).join('')}
      </svg>
      <div class="radar-legend">
        <div class="risk-score ${riskLevel.toLowerCase()}">
          Risk Level: <span class="risk-value">${riskLevel}</span>
        </div>
        <div class="threat-count">${threats.length} active threats detected</div>
      </div>
    </div>
  `;
}

function renderIntelligenceStory(signals) {
  const container = document.getElementById('intelligence-story') || createIntelligenceStoryContainer();
  const story = generateNarrativeFromSignals(signals);
  
  // Clear container and start typewriter effect
  container.innerHTML = '<div class="story-text"></div><div class="story-actions"></div>';
  const textContainer = container.querySelector('.story-text');
  
  let index = 0;
  const typeWriter = setInterval(() => {
    if (index < story.length) {
      textContainer.innerHTML += story[index];
      index++;
      
      // Auto-scroll to bottom
      textContainer.scrollTop = textContainer.scrollHeight;
    } else {
      clearInterval(typeWriter);
      revealActionButtons(container.querySelector('.story-actions'), signals);
    }
  }, 30); // Faster typing for urgency
}

function generateNarrativeFromSignals(signals) {
  const critical = signals.filter(s => s.tier === 'RED');
  const high = signals.filter(s => s.tier === 'ORANGE');
  const medium = signals.filter(s => s.tier === 'YELLOW');
  
  if (critical.length > 0) {
    const mainThreat = critical[0];
    return `🚨 CRITICAL ALERT: This token is showing ${critical.length} critical warning signs.\n\n` +
           `The biggest threat: ${mainThreat.reason}\n\n` +
           `Our AI is ${(mainThreat.confidence * 100).toFixed(0)}% certain this could end badly.\n\n` +
           `${critical.length > 1 ? `Plus ${critical.length - 1} other critical issues detected.\n\n` : ''}` +
           `⏰ Time to exit: IMMEDIATELY. This could dump within hours.`;
  }
  
  if (high.length > 0) {
    return `⚠️ HIGH RISK DETECTED: We've found ${high.length} serious warning signs.\n\n` +
           `Primary concern: ${high[0].reason}\n\n` +
           `This token shows patterns we've seen before major dumps.\n\n` +
           `Recommendation: Consider your exit strategy now.`;
  }
  
  if (medium.length > 0) {
    return `🔍 CAUTION ADVISED: ${medium.length} potential issues detected.\n\n` +
           `Main concern: ${medium[0].reason}\n\n` +
           `Not immediately dangerous, but worth monitoring closely.\n\n` +
           `Keep your position size reasonable.`;
  }
  
  return `✅ LOOKING GOOD: No major threats detected.\n\n` +
         `This token passes our safety checks.\n\n` +
         `Remember: Even safe tokens can become risky. Stay vigilant.`;
}

function showManipulationDetection(score) {
  const container = document.getElementById('manipulation-theater') || createManipulationTheaterContainer();
  
  const manipulationLevel = score.manipulationRisk || 'MEDIUM';
  const timeToExit = manipulationLevel === 'HIGH' ? '15:00' : '45:00';
  
  container.innerHTML = `
    <div class="manipulation-alert ${manipulationLevel.toLowerCase()}">
      <div class="manipulation-title">🎭 MANIPULATION DETECTED</div>
      <div class="manipulation-stage">
        <div class="actor whale">
          <div class="wallet">🐋 Whale</div>
          <div class="action">Accumulating...</div>
          <div class="status active"></div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="actor pump">
          <div class="wallet">📈 Pump Group</div>
          <div class="action">Coordinating buys...</div>
          <div class="status active"></div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="actor you">
          <div class="wallet">👤 YOU</div>
          <div class="action">Exit liquidity</div>
          <div class="status warning"></div>
        </div>
      </div>
      <div class="dump-timer">
        <div class="timer-label">Estimated dump in:</div>
        <div class="countdown" data-time="${timeToExit}">${timeToExit}</div>
      </div>
      <div class="manipulation-advice">
        ${manipulationLevel === 'HIGH' ? 
          '🚨 HIGH PROBABILITY: Coordinated manipulation detected. Exit immediately.' :
          '⚠️ MEDIUM RISK: Suspicious patterns detected. Monitor closely.'
        }
      </div>
    </div>
  `;
  
  startDumpCountdown(container.querySelector('.countdown'));
}

function revealActionButtons(container, signals) {
  const critical = signals.filter(s => s.tier === 'RED');
  const riskLevel = critical.length > 0 ? 'CRITICAL' : 'MODERATE';
  
  container.innerHTML = `
    <div class="action-buttons">
      ${riskLevel === 'CRITICAL' ? 
        '<button class="action-btn exit-now">🚨 EXIT NOW</button>' :
        '<button class="action-btn monitor">👁️ MONITOR CLOSELY</button>'
      }
      <button class="action-btn details">📊 FULL ANALYSIS</button>
      <button class="action-btn share">📤 SHARE WARNING</button>
    </div>
  `;
  
  // Add click handlers
  container.querySelector('.exit-now, .monitor')?.addEventListener('click', () => {
    showEscapePlan(signals);
  });
  
  container.querySelector('.details')?.addEventListener('click', () => {
    expandAnalysis(signals);
  });
}

function startDumpCountdown(element) {
  if (!element) return;
  
  let timeString = element.dataset.time || '15:00';
  let [minutes, seconds] = timeString.split(':').map(Number);
  let totalSeconds = minutes * 60 + seconds;
  
  const countdown = setInterval(() => {
    totalSeconds--;
    
    if (totalSeconds <= 0) {
      clearInterval(countdown);
      element.textContent = '💥 DUMP TIME';
      element.classList.add('expired');
      return;
    }
    
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    element.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    // Add urgency styling as time runs out
    if (totalSeconds < 300) { // Less than 5 minutes
      element.classList.add('urgent');
    }
  }, 1000);
}

// Container creation functions
function createThreatRadarContainer() {
  const container = document.createElement('div');
  container.id = 'threat-radar';
  container.className = 'threat-radar-wrapper';
  
  const scoreCard = document.getElementById('score-card');
  scoreCard.insertBefore(container, scoreCard.firstChild);
  
  return container;
}

function createIntelligenceStoryContainer() {
  const container = document.createElement('div');
  container.id = 'intelligence-story';
  container.className = 'intelligence-story-wrapper';
  
  const scoreCard = document.getElementById('score-card');
  scoreCard.appendChild(container);
  
  return container;
}

function createManipulationTheaterContainer() {
  const container = document.createElement('div');
  container.id = 'manipulation-theater';
  container.className = 'manipulation-theater-wrapper';
  
  const scoreCard = document.getElementById('score-card');
  scoreCard.appendChild(container);
  
  return container;
}

function renderEnhancedScore(score) {
  // Fallback for when signals aren't available
  const container = document.getElementById('enhanced-score') || createEnhancedScoreContainer();
  const riskLevel = score.score < 30 ? 'CRITICAL' : score.score < 60 ? 'HIGH' : 'MODERATE';
  
  container.innerHTML = `
    <div class="enhanced-score ${riskLevel.toLowerCase()}">
      <div class="score-display">
        <div class="score-number">${score.score}</div>
        <div class="score-label">Risk Score</div>
      </div>
      <div class="risk-indicator ${riskLevel.toLowerCase()}">
        ${riskLevel} RISK
      </div>
    </div>
  `;
}

function createEnhancedScoreContainer() {
  const container = document.createElement('div');
  container.id = 'enhanced-score';
  
  const scoreCard = document.getElementById('score-card');
  scoreCard.insertBefore(container, scoreCard.firstChild);
  
  return container;
}

function renderProgressiveSignals(signals) {
  const signalsContainer = document.getElementById('signals-container') || createSignalsContainer();
  
  // Group signals by tier for progressive disclosure
  const signalsByTier = signals.reduce((acc, signal) => {
    acc[signal.tier] = acc[signal.tier] || [];
    acc[signal.tier].push(signal);
    return acc;
  }, {});

  const tierColors = {
    'RED': '#ff4444',
    'ORANGE': '#ff8800', 
    'YELLOW': '#ffaa00',
    'GREEN': '#44ff44'
  };

  let signalsHTML = '<div class="signals-section"><h4>🔍 Intelligence Signals</h4>';
  
  Object.entries(signalsByTier).forEach(([tier, tierSignals]) => {
    const color = tierColors[tier] || '#888';
    signalsHTML += `
      <div class="signal-tier" style="border-left: 4px solid ${color}; margin: 8px 0; padding: 8px;">
        <div class="tier-header" style="color: ${color}; font-weight: bold; margin-bottom: 4px;">
          ${tier} TIER (${tierSignals.length})
        </div>
        ${tierSignals.map(signal => `
          <div class="signal-item" style="margin: 4px 0; padding: 4px 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
            <div style="font-weight: bold;">${signal.type}</div>
            <div style="font-size: 0.9em; opacity: 0.9;">${signal.reason}</div>
            <div style="font-size: 0.8em; opacity: 0.7;">Confidence: ${(signal.confidence * 100).toFixed(0)}%</div>
          </div>
        `).join('')}
      </div>
    `;
  });
  
  signalsHTML += '</div>';
  signalsContainer.innerHTML = signalsHTML;
}

function createSignalsContainer() {
  const container = document.createElement('div');
  container.id = 'signals-container';
  container.className = 'signals-container';
  
  // Insert after score reasons
  const scoreCard = document.getElementById('score-card');
  const scoreReasons = document.getElementById('score-reasons');
  scoreCard.insertBefore(container, scoreReasons.nextSibling);
  
  return container;
}

function renderHolders(data) {
  const tbody = $('holders-body');
  tbody.innerHTML = '';
  data.slice(0, 10).forEach((h, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td><code>${h.address}</code></td><td>${h.uiAmount}</td><td>${(h.percent||0).toFixed(2)}%</td>`;
    tbody.appendChild(tr);
  });
  show('holders');
}

function renderLiquidity(info) {
  const el = $('liquidity-body');
  if (!info || !info.pairs || !info.pairs.length) {
    el.textContent = 'No pairs found on Dexscreener.';
  } else {
    const top = info.pairs[0];
    el.innerHTML = `
      <div><b>Pair</b>: ${top.chainId || 'solana'} • ${top.dexId || ''}</div>
      <div><b>Liquidity (USD)</b>: ${top.liquidity && top.liquidity.usd ? top.liquidity.usd.toLocaleString() : '—'}</div>
      <div><b>FDV</b>: ${top.fdv ? top.fdv.toLocaleString() : '—'}</div>
      <div><b>Price</b>: ${top.priceUsd ? `$${Number(top.priceUsd).toFixed(6)}` : '—'}</div>
    `;
  }
  show('liquidity');
}

function renderChart(mint) {
  const url = `https://dexscreener.com/solana/${mint}?embed=1&theme=dark`;
  const iframe = $('dexscreener-embed');
  iframe.src = url;
  iframe.style.height = '600px';
  iframe.style.width = '100%';
  show('chart');
}

function renderBubbles(data) {
  const container = document.getElementById('bubbles');
  
  if (!data.nodes || data.nodes.length === 0) {
    container.innerHTML = '<div class="card">No bubble map data available</div>';
    return;
  }
  
  // Create interactive bubble visualization
  container.innerHTML = `
    <div class="card">
      <h3>Interactive Bubble Map</h3>
      <div id="bubble-viz" style="width: 100%; height: 400px; background: #1a1a2e; border-radius: 8px; position: relative;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #888;">
          🔄 Loading interactive visualization...
        </div>
      </div>
      <details style="margin-top: 10px;">
        <summary>Raw Data (${data.nodes.length} nodes, ${data.links.length} links)</summary>
        <pre style="max-height: 200px; overflow-y: auto;">${JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  `;
  
  // Initialize D3.js visualization
  setTimeout(() => initBubbleVisualization(data), 100);
}

function initBubbleVisualization(data) {
  const container = document.getElementById('bubble-viz');
  if (!container || !window.d3) {
    // Fallback if D3.js not loaded
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #888;">
        <div>📊 Interactive visualization requires D3.js</div>
        <div style="margin-top: 10px; font-size: 0.9em;">
          Showing ${data.nodes.length} holders with ${data.links.length} connections
        </div>
      </div>
    `;
    return;
  }
  
  // D3.js bubble visualization will be implemented here
  container.innerHTML = `
    <div style="padding: 20px; text-align: center; color: #888;">
      <div>🎯 Bubble visualization coming soon</div>
      <div style="margin-top: 10px; font-size: 0.9em;">
        ${data.nodes.length} nodes • ${data.links.length} connections
      </div>
    </div>
  `;
}

async function loadAIAnalysis(address, type, data) {
  try {
    const aiResult = await api('ai-agent', { address, type, data });
    renderAIAnalysis(aiResult);
  } catch (err) {
    console.error('AI Analysis failed:', err);
    renderAIAnalysis({ 
      message: "🤖 AI Analysis unavailable", 
      analysis: "Manual analysis required - check the data above for insights.",
      risk_level: "unknown"
    });
  }
}

function renderAIAnalysis(data) {
  const container = document.getElementById('ai-analysis') || createAIAnalysisSection();
  const riskColor = data.risk_level === 'high' ? '#ff4444' : 
                   data.risk_level === 'medium' ? '#ffaa00' : 
                   data.risk_level === 'low' ? '#44ff44' : '#888';
  
  container.innerHTML = `
    <div class="card">
      <h3>🤖 AI Agent Analysis</h3>
      <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin: 10px 0;">
        <div style="color: ${riskColor}; font-weight: bold; margin-bottom: 10px;">
          Risk Level: ${data.risk_level?.toUpperCase() || 'UNKNOWN'}
        </div>
        <div style="line-height: 1.6; white-space: pre-wrap;">${data.analysis}</div>
        ${data.model_used ? `<div style="opacity: 0.7; font-size: 0.8em; margin-top: 10px;">Powered by ${data.model_used}</div>` : ''}
      </div>
    </div>
  `;
}

function createAIAnalysisSection() {
  const section = document.createElement('div');
  section.id = 'ai-analysis';
  section.className = 'section';
  
  // Insert after the summary section
  const summarySection = document.getElementById('summary');
  summarySection.parentNode.insertBefore(section, summarySection.nextSibling);
  
  return container;
}

async function analyze(address) {
  clearError();
  hide('score-card');
  hide('holders');
  hide('bubbles');
  
  // Start dramatic analysis with progressive revelation
  await analyzeWithDrama(address);
}

async function analyzeWithDrama(address) {
  // Phase 1: Immediate danger check (0-500ms)
  showLoadingPulse("🔍 Scanning for immediate threats...");
  
  try {
    const quickCheck = await api('score', { kind: 'token', address });
    
    if (quickCheck.score < 30) {
      showCriticalWarning("🚨 HIGH RISK DETECTED - ANALYZING DEEPER");
      await delay(800); // Build suspense
    }
    
    // Phase 2: Build suspense (500-2000ms)
    updateLoadingMessage("🕵️ Checking manipulation patterns...");
    await delay(700);
    
    updateLoadingMessage("🧠 Running AI behavioral analysis...");
    await delay(600);
    
    updateLoadingMessage("📊 Cross-referencing threat database...");
    await delay(500);
    
    // Phase 3: Reveal the story
    hide('loading');
    renderScore(quickCheck);
    
    // Phase 4: Show escape plan if critical
    if (quickCheck.score < 30) {
      setTimeout(() => showEscapePlan(quickCheck.signals || []), 2000);
    }
    
  } catch (error) {
    hide('loading');
    showError(`Analysis failed: ${error.message}`);
  }
}

function showLoadingPulse(message) {
  const loading = document.getElementById('loading');
  loading.innerHTML = `
    <div class="loading-pulse">
      <div class="pulse-circle"></div>
      <div class="loading-message">${message}</div>
      <div class="loading-progress">
        <div class="progress-bar"></div>
      </div>
    </div>
  `;
  show('loading');
}

function updateLoadingMessage(message) {
  const messageEl = document.querySelector('.loading-message');
  if (messageEl) {
    messageEl.textContent = message;
  }
}

function showCriticalWarning(message) {
  const warning = document.createElement('div');
  warning.className = 'critical-warning';
  warning.innerHTML = `
    <div class="warning-content">
      <div class="warning-icon">⚠️</div>
      <div class="warning-text">${message}</div>
    </div>
  `;
  
  document.body.appendChild(warning);
  
  // Shake animation
  setTimeout(() => {
    warning.classList.add('shake');
  }, 100);
  
  // Remove after delay
  setTimeout(() => {
    warning.remove();
  }, 3000);
}

function showEscapePlan(signals) {
  const container = document.getElementById('escape-plan') || createEscapePlanContainer();
  
  const critical = signals.filter(s => s.tier === 'RED');
  const timeframe = critical.length > 2 ? 'MINUTES' : 'HOURS';
  
  container.innerHTML = `
    <div class="escape-plan">
      <div class="escape-title">🚨 ESCAPE PLAN ACTIVATED</div>
      <div class="escape-timeline">
        <div class="timeline-item urgent">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-title">RIGHT NOW</div>
            <div class="timeline-action">Stop buying. Cancel pending orders.</div>
          </div>
        </div>
        <div class="timeline-item warning">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-title">NEXT ${timeframe}</div>
            <div class="timeline-action">Exit position gradually. Don't dump all at once.</div>
          </div>
        </div>
        <div class="timeline-item safe">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-title">AFTER EXIT</div>
            <div class="timeline-action">Monitor from sidelines. Share warning with others.</div>
          </div>
        </div>
      </div>
      <div class="escape-actions">
        <button class="escape-btn primary">📱 SET PRICE ALERTS</button>
        <button class="escape-btn secondary">📤 WARN COMMUNITY</button>
      </div>
    </div>
  `;
  
  // Auto-hide after 10 seconds unless user interacts
  let autoHideTimer = setTimeout(() => {
    container.style.opacity = '0.7';
  }, 10000);
  
  container.addEventListener('mouseenter', () => {
    clearTimeout(autoHideTimer);
    container.style.opacity = '1';
  });
}

function expandAnalysis(signals) {
  const container = document.getElementById('expanded-analysis') || createExpandedAnalysisContainer();
  
  container.innerHTML = `
    <div class="expanded-analysis">
      <div class="analysis-header">
        <h3>🔬 DETAILED THREAT ANALYSIS</h3>
        <button class="close-btn">×</button>
      </div>
      <div class="analysis-grid">
        ${signals.map(signal => `
          <div class="threat-card ${signal.tier.toLowerCase()}">
            <div class="threat-header">
              <div class="threat-type">${signal.type.replace(/_/g, ' ')}</div>
              <div class="threat-confidence">${(signal.confidence * 100).toFixed(0)}%</div>
            </div>
            <div class="threat-reason">${signal.reason}</div>
            <div class="threat-severity ${signal.tier.toLowerCase()}">${signal.tier} RISK</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  // Close button handler
  container.querySelector('.close-btn').addEventListener('click', () => {
    container.style.display = 'none';
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Additional container creation functions
function createEscapePlanContainer() {
  const container = document.createElement('div');
  container.id = 'escape-plan';
  container.className = 'escape-plan-wrapper';
  
  document.body.appendChild(container);
  return container;
}

function createExpandedAnalysisContainer() {
  const container = document.createElement('div');
  container.id = 'expanded-analysis';
  container.className = 'expanded-analysis-wrapper';
  
  document.body.appendChild(container);
  return container;
}
