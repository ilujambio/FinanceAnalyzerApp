import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const form = document.getElementById('ticker-form');
const results = document.getElementById('results');

let currentChartInstance = null;
let currentPriceData = [];
let currentTicker = '';
let currentSpan = '1Y';
let activeOverlays = {
  sma20: true,
  sma50: true,
  ema20: false
};

// Technical Indicators Calculation Helpers
function calculateSMA(data, period) {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j];
      }
      sma.push(sum / period);
    }
  }
  return sma;
}

function calculateEMA(data, period) {
  const ema = [];
  const k = 2 / (period + 1);
  let initialSum = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      initialSum += data[i];
      ema.push(null);
    } else if (i === period - 1) {
      initialSum += data[i];
      ema.push(initialSum / period);
    } else {
      const prevEma = ema[i - 1];
      const currentEma = data[i] * k + prevEma * (1 - k);
      ema.push(currentEma);
    }
  }
  return ema;
}

function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = calculateEMA(data, fastPeriod);
  const emaSlow = calculateEMA(data, slowPeriod);
  const macdLine = [];

  for (let i = 0; i < data.length; i++) {
    if (emaFast[i] === null || emaSlow[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(emaFast[i] - emaSlow[i]);
    }
  }

  const validMacdStartIndex = macdLine.findIndex(v => v !== null);
  if (validMacdStartIndex === -1) {
    return { macdLine, signalLine: new Array(data.length).fill(null), histogram: new Array(data.length).fill(null) };
  }

  const validMacdValues = macdLine.slice(validMacdStartIndex);
  const validSignal = calculateEMA(validMacdValues, signalPeriod);

  const signalLine = new Array(data.length).fill(null);
  for (let i = 0; i < validSignal.length; i++) {
    signalLine[validMacdStartIndex + i] = validSignal[i];
  }

  const histogram = [];
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] === null || signalLine[i] === null) {
      histogram.push(null);
    } else {
      histogram.push(macdLine[i] - signalLine[i]);
    }
  }

  return { macdLine, signalLine, histogram };
}

function calculateRSI(data, period = 14) {
  const rsi = new Array(data.length).fill(null);
  if (data.length <= period) return rsi;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    rsi[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    rsi[period] = 100 - (100 / (1 + rs));
  }

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    const currentGain = diff > 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    if (avgLoss === 0) {
      rsi[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }

  return rsi;
}

function analyzeCompoundSignal(rsiVal, macdObj) {
  const macdVal = macdObj.macdLine[macdObj.macdLine.length - 1];
  const signalVal = macdObj.signalLine[macdObj.signalLine.length - 1];
  const histVal = macdObj.histogram[macdObj.histogram.length - 1];
  const prevHist = macdObj.histogram.length > 1 ? macdObj.histogram[macdObj.histogram.length - 2] : histVal;

  let score = 0;
  let rsiStatus = 'Neutral';
  let rsiDetail = '';
  let macdStatus = 'Neutral';
  let macdDetail = '';

  // RSI Assessment
  if (rsiVal !== null) {
    if (rsiVal >= 70) {
      score -= 3;
      rsiStatus = 'Overbought';
      rsiDetail = `RSI at ${rsiVal.toFixed(1)} indicates overbought conditions (sell pressure possible).`;
    } else if (rsiVal <= 30) {
      score += 4;
      rsiStatus = 'Oversold';
      rsiDetail = `RSI at ${rsiVal.toFixed(1)} indicates oversold levels (bullish reversal opportunity).`;
    } else if (rsiVal >= 55) {
      score += 2;
      rsiStatus = 'Bullish Zone';
      rsiDetail = `RSI at ${rsiVal.toFixed(1)} shows active upward momentum.`;
    } else if (rsiVal <= 45) {
      score -= 2;
      rsiStatus = 'Bearish Zone';
      rsiDetail = `RSI at ${rsiVal.toFixed(1)} shows prevailing downside pressure.`;
    } else {
      rsiStatus = 'Neutral';
      rsiDetail = `RSI at ${rsiVal.toFixed(1)} indicates balanced buying/selling.`;
    }
  }

  // MACD Assessment
  if (macdVal !== null && signalVal !== null && histVal !== null) {
    if (macdVal > signalVal) {
      score += 3;
      macdStatus = 'Bullish Crossover';
      if (histVal > prevHist) {
        score += 1;
        macdDetail = `MACD (${macdVal.toFixed(2)}) is above Signal (${signalVal.toFixed(2)}) with expanding positive histogram (+${histVal.toFixed(2)}).`;
      } else {
        macdDetail = `MACD (${macdVal.toFixed(2)}) is above Signal (${signalVal.toFixed(2)}), though positive momentum is slowing.`;
      }
    } else {
      score -= 3;
      macdStatus = 'Bearish Crossover';
      if (histVal < prevHist) {
        score -= 1;
        macdDetail = `MACD (${macdVal.toFixed(2)}) is below Signal (${signalVal.toFixed(2)}) with expanding negative histogram (${histVal.toFixed(2)}).`;
      } else {
        macdDetail = `MACD (${macdVal.toFixed(2)}) is below Signal (${signalVal.toFixed(2)}), with bearish momentum subsiding.`;
      }
    }
  }

  // Compound Signal Mapping
  let rating = 'Neutral / Hold';
  let badgeClass = 'compound-neutral';
  let recommendation = 'Hold / Monitor for confirmation.';

  if (score >= 5) {
    rating = 'Strong Buy / Bullish';
    badgeClass = 'compound-strong-buy';
    recommendation = 'Strong alignment of momentum (RSI) and trend divergence (MACD) favoring upside accumulation.';
  } else if (score >= 2) {
    rating = 'Moderate Buy / Bullish';
    badgeClass = 'compound-buy';
    recommendation = 'Positive momentum building across RSI & MACD metrics.';
  } else if (score <= -5) {
    rating = 'Strong Sell / Bearish';
    badgeClass = 'compound-strong-sell';
    recommendation = 'Negative alignment of RSI and MACD pointing to ongoing downward pressure.';
  } else if (score <= -2) {
    rating = 'Moderate Sell / Bearish';
    badgeClass = 'compound-sell';
    recommendation = 'Weakening technical indicators suggesting defensive positioning.';
  }

  return {
    score,
    rating,
    badgeClass,
    rsiStatus,
    rsiDetail,
    macdStatus,
    macdDetail,
    recommendation,
    summaryText: `RSI (${rsiVal !== null ? rsiVal.toFixed(1) : 'N/A'}) & MACD (${histVal !== null ? histVal.toFixed(2) : 'N/A'}) Compound Score: ${score > 0 ? '+' : ''}${score}`
  };
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const ticker = document.getElementById('ticker').value.trim().toUpperCase();
  const twelveDataKey = document.getElementById('twelvedata-key').value.trim();
  const openRouterKey = document.getElementById('openrouter-key').value.trim();

  results.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Fetching market data and running AI technical analysis for <strong>${ticker}</strong>...</p>
    </div>
  `;

  try {
    const priceData = await fetchPriceData(ticker, twelveDataKey);
    
    currentPriceData = priceData;
    currentTicker = ticker;
    currentSpan = '1Y'; // Default to 1 Year view

    // Precalculate full dataset indicators
    const closes = priceData.map(b => b.close);
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const ema50 = calculateEMA(closes, 50);
    const macdObj = calculateMACD(closes, 12, 26, 9);
    const rsi14 = calculateRSI(closes, 14);

    const latestIdx = priceData.length - 1;
    const latestRsi = rsi14[latestIdx];
    const compound = analyzeCompoundSignal(latestRsi, macdObj);

    const indicators = {
      sma20: sma20[latestIdx],
      sma50: sma50[latestIdx],
      ema12: ema12[latestIdx],
      ema26: ema26[latestIdx],
      ema50: ema50[latestIdx],
      macdLine: macdObj.macdLine[latestIdx],
      macdSignal: macdObj.signalLine[latestIdx],
      macdHist: macdObj.histogram[latestIdx],
      rsi14: latestRsi,
      compound,
      // Pass arrays for charting
      fullArrays: { sma20, sma50, ema12, ema26, ema50, macdObj, rsi14 }
    };

    const note = await getResearchNote(ticker, priceData, indicators, openRouterKey);

    renderResults(ticker, priceData, indicators, note);
  } catch (err) {
    results.innerHTML = `<p class="error">Something went wrong: ${err.message}</p>`;
  }
});

// Twelve Data price history
async function fetchPriceData(ticker, apiKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1day&outputsize=2000&apikey=${apiKey}`;
  const response = await fetch(url);

  const body = await response.text();
  let raw;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new Error(body.trim() || 'Price fetch failed');
  }

  if (raw && raw.status === 'error') throw new Error(raw.message || 'Price fetch failed');
  if (!response.ok) throw new Error('Price fetch failed');

  const values = raw.values ?? [];
  if (!values.length) throw new Error(`No price data returned for ${ticker}`);

  return values
    .map((b) => ({
      date: b.datetime,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: Number(b.volume)
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function getResearchNote(ticker, priceData, indicators, apiKey) {
  const first = priceData[0];
  const latest = priceData[priceData.length - 1];
  const pctChange = ((latest.close - first.close) / first.close) * 100;

  const techSummary = [
    `SMA(20): $${indicators.sma20 ? indicators.sma20.toFixed(2) : 'N/A'}, SMA(50): $${indicators.sma50 ? indicators.sma50.toFixed(2) : 'N/A'} (${indicators.sma20 > indicators.sma50 ? 'Golden Alignment' : 'Death Alignment'})`,
    `EMA(12): $${indicators.ema12 ? indicators.ema12.toFixed(2) : 'N/A'}, EMA(26): $${indicators.ema26 ? indicators.ema26.toFixed(2) : 'N/A'}, EMA(50): $${indicators.ema50 ? indicators.ema50.toFixed(2) : 'N/A'}`,
    `MACD (12,26,9): Line $${indicators.macdLine ? indicators.macdLine.toFixed(2) : 'N/A'}, Signal $${indicators.macdSignal ? indicators.macdSignal.toFixed(2) : 'N/A'}, Hist $${indicators.macdHist ? indicators.macdHist.toFixed(2) : 'N/A'}`,
    `RSI (14): ${indicators.rsi14 ? indicators.rsi14.toFixed(1) : 'N/A'} (${indicators.compound.rsiStatus})`,
    `Compound RSI+MACD Rating: ${indicators.compound.rating} (Score: ${indicators.compound.score > 0 ? '+' : ''}${indicators.compound.score})`
  ].join('\n- ');

  const summary =
    `${ticker} price evolution (${first.date} to ${latest.date}): ` +
    `start $${first.close.toFixed(2)}, latest $${latest.close.toFixed(2)}, ` +
    `change ${pctChange.toFixed(1)}%.\n` +
    `Latest Day: Open $${latest.open.toFixed(2)}, High $${latest.high.toFixed(2)}, Low $${latest.low.toFixed(2)}, Close $${latest.close.toFixed(2)}, Vol ${latest.volume.toLocaleString()}.\n\n` +
    `Key Technical Indicators:\n- ${techSummary}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-5',
      max_tokens: 2000,
      reasoning: { enabled: false },
      messages: [
        { role: 'system', content: 'You are an elite quantitative financial analyst at Oyster Capital. Be concise, insightful, and rigorous.' },
        { role: 'user', content: `${summary}\n\nWrite a concise two-paragraph research note evaluating ${ticker}'s price trend, technical indicators (SMA, EMA, MACD, RSI), and the RSI+MACD compound signal.` }
      ]
    })
  });

  if (!response.ok) throw new Error(`OpenRouter call failed. ${await readOpenRouterError(response)}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? 'No response generated.';
}

async function readOpenRouterError(response) {
  let message = '';
  try {
    const body = await response.json();
    const err = body.error ?? body;
    message = err.message || '';
    const provider = err.metadata?.provider_name;
    const raw = err.metadata?.raw;
    if (provider) message += ` [provider: ${provider}]`;
    if (raw) message += ` ${typeof raw === 'string' ? raw : JSON.stringify(raw)}`;
  } catch {
    // Non-JSON
  }
  const hint = {
    401: 'Your API key looks invalid or missing',
    402: 'This model is paid and your OpenRouter account is out of credits',
    429: 'Rate limited, wait a moment and try again'
  }[response.status];
  return [`(HTTP ${response.status})`, hint, message].filter(Boolean).join(' ');
}

function filterDataByTimeSpan(priceData, span) {
  if (!priceData || !priceData.length) return [];
  if (span === 'ALL') return priceData;

  const latestDate = new Date(priceData[priceData.length - 1].date);
  let cutoff = new Date(latestDate);

  switch (span) {
    case '1M':
      cutoff.setMonth(cutoff.getMonth() - 1);
      break;
    case '3M':
      cutoff.setMonth(cutoff.getMonth() - 3);
      break;
    case '6M':
      cutoff.setMonth(cutoff.getMonth() - 6);
      break;
    case '1Y':
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      break;
    case '5Y':
      cutoff.setFullYear(cutoff.getFullYear() - 5);
      break;
    default:
      return priceData;
  }

  const cutoffStr = cutoff.toISOString().split('T')[0];
  const filtered = priceData.filter(b => b.date >= cutoffStr);
  return filtered.length > 0 ? filtered : priceData;
}

let currentIndicators = null;

function renderResults(ticker, priceData, indicators, note) {
  currentIndicators = indicators;
  const latest = priceData[priceData.length - 1];
  const prev = priceData.length > 1 ? priceData[priceData.length - 2] : latest;
  const dayChange = latest.close - prev.close;
  const dayChangePct = prev.close ? (dayChange / prev.close) * 100 : 0;
  
  const isPositive = dayChange >= 0;
  const changeClass = isPositive ? 'pos-change' : 'neg-change';
  const changeSign = isPositive ? '+' : '';

  const dayRangeSpread = latest.high - latest.low;
  const dayRangePos = dayRangeSpread > 0 
    ? Math.min(100, Math.max(0, ((latest.close - latest.low) / dayRangeSpread) * 100))
    : 50;

  const { compound, sma20, sma50, ema12, ema26, ema50, macdLine, macdSignal, macdHist, rsi14 } = indicators;

  // Golden cross / Death cross status
  const isGoldenCross = sma20 && sma50 && sma20 > sma50;

  // RSI position gauge percentage
  const rsiGaugePos = rsi14 !== null ? Math.min(100, Math.max(0, rsi14)) : 50;

  results.innerHTML = `
    <div class="ticker-header-bar">
      <div>
        <h2 class="ticker-title">${ticker}</h2>
        <span class="ticker-subtitle">Last Traded: ${latest.date}</span>
      </div>
      <div class="price-hero">
        <div class="main-price">$${latest.close.toFixed(2)}</div>
        <div class="price-badge ${changeClass}">
          ${changeSign}$${Math.abs(dayChange).toFixed(2)} (${changeSign}${dayChangePct.toFixed(2)}%)
        </div>
      </div>
    </div>

    <!-- Key Numbers and Figures of Last Day -->
    <div class="figures-section">
      <h3 class="section-heading">Key Figures (Last Day)</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">Open</span>
          <span class="stat-value">$${latest.open.toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Day High</span>
          <span class="stat-value">$${latest.high.toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Day Low</span>
          <span class="stat-value">$${latest.low.toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Prev. Close</span>
          <span class="stat-value">$${prev.close.toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Volume</span>
          <span class="stat-value">${latest.volume.toLocaleString()}</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Day Range</span>
          <div class="range-meter">
            <span class="range-min">$${latest.low.toFixed(2)}</span>
            <div class="range-track">
              <div class="range-thumb" style="left: ${dayRangePos}%;"></div>
            </div>
            <span class="range-max">$${latest.high.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Compound RSI & MACD Signal Highlight Card -->
    <div class="compound-card-section">
      <div class="compound-header">
        <div>
          <span class="compound-tag">Compound Technical Signal</span>
          <h3 class="compound-title">RSI & MACD Synthesis</h3>
        </div>
        <div class="compound-badge ${compound.badgeClass}">
          ${compound.rating}
        </div>
      </div>
      <div class="compound-grid">
        <div class="compound-item">
          <span class="compound-item-label">RSI (14) Signal</span>
          <span class="compound-item-val">${compound.rsiStatus}</span>
          <p class="compound-item-desc">${compound.rsiDetail}</p>
        </div>
        <div class="compound-item">
          <span class="compound-item-label">MACD (12,26,9) Signal</span>
          <span class="compound-item-val">${compound.macdStatus}</span>
          <p class="compound-item-desc">${compound.macdDetail}</p>
        </div>
      </div>
      <div class="compound-footer">
        <span class="compound-summary-tag">${compound.summaryText}</span>
        <p class="compound-recommendation"><strong>Recommendation:</strong> ${compound.recommendation}</p>
      </div>
    </div>

    <!-- Technical Indicators Key Metrics Panel -->
    <div class="indicators-section">
      <h3 class="section-heading">Technical Indicators Overview</h3>
      <div class="indicators-grid">
        <!-- SMA Card -->
        <div class="indicator-card">
          <div class="indicator-header">
            <span class="indicator-title">SMA (Moving Averages)</span>
            <span class="indicator-status ${isGoldenCross ? 'status-bull' : 'status-bear'}">
              ${isGoldenCross ? 'Golden Alignment' : 'Death Alignment'}
            </span>
          </div>
          <div class="indicator-body">
            <div class="ind-row">
              <span class="ind-name">SMA (20)</span>
              <span class="ind-val">$${sma20 ? sma20.toFixed(2) : 'N/A'}</span>
            </div>
            <div class="ind-row">
              <span class="ind-name">SMA (50)</span>
              <span class="ind-val">$${sma50 ? sma50.toFixed(2) : 'N/A'}</span>
            </div>
          </div>
        </div>

        <!-- EMA Card -->
        <div class="indicator-card">
          <div class="indicator-header">
            <span class="indicator-title">EMA (Exponential)</span>
            <span class="indicator-status status-neutral">
              Trend Gauge
            </span>
          </div>
          <div class="indicator-body">
            <div class="ind-row">
              <span class="ind-name">EMA (12)</span>
              <span class="ind-val">$${ema12 ? ema12.toFixed(2) : 'N/A'}</span>
            </div>
            <div class="ind-row">
              <span class="ind-name">EMA (26)</span>
              <span class="ind-val">$${ema26 ? ema26.toFixed(2) : 'N/A'}</span>
            </div>
            <div class="ind-row">
              <span class="ind-name">EMA (50)</span>
              <span class="ind-val">$${ema50 ? ema50.toFixed(2) : 'N/A'}</span>
            </div>
          </div>
        </div>

        <!-- MACD Card -->
        <div class="indicator-card">
          <div class="indicator-header">
            <span class="indicator-title">MACD (12, 26, 9)</span>
            <span class="indicator-status ${macdHist >= 0 ? 'status-bull' : 'status-bear'}">
              ${macdHist >= 0 ? 'Bullish Hist' : 'Bearish Hist'}
            </span>
          </div>
          <div class="indicator-body">
            <div class="ind-row">
              <span class="ind-name">MACD Line</span>
              <span class="ind-val">$${macdLine !== null ? macdLine.toFixed(2) : 'N/A'}</span>
            </div>
            <div class="ind-row">
              <span class="ind-name">Signal Line</span>
              <span class="ind-val">$${macdSignal !== null ? macdSignal.toFixed(2) : 'N/A'}</span>
            </div>
            <div class="ind-row">
              <span class="ind-name">Histogram</span>
              <span class="ind-val ${macdHist >= 0 ? 'pos-text' : 'neg-text'}">
                ${macdHist !== null ? (macdHist >= 0 ? '+' : '') + macdHist.toFixed(2) : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        <!-- RSI Card -->
        <div class="indicator-card">
          <div class="indicator-header">
            <span class="indicator-title">RSI (14)</span>
            <span class="indicator-status ${rsi14 >= 70 ? 'status-bear' : rsi14 <= 30 ? 'status-bull' : 'status-neutral'}">
              ${compound.rsiStatus}
            </span>
          </div>
          <div class="indicator-body">
            <div class="ind-row">
              <span class="ind-name">RSI Level</span>
              <span class="ind-val">${rsi14 !== null ? rsi14.toFixed(1) : 'N/A'} / 100</span>
            </div>
            <div class="rsi-gauge-container">
              <div class="rsi-gauge-bar">
                <div class="rsi-zone zone-oversold"></div>
                <div class="rsi-zone zone-neutral"></div>
                <div class="rsi-zone zone-overbought"></div>
                <div class="rsi-pointer" style="left: ${rsiGaugePos}%;"></div>
              </div>
              <div class="rsi-gauge-labels">
                <span>0 (Oversold)</span>
                <span>50</span>
                <span>100 (Overbought)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Stock Price Evolution Chart with Overlay Controls -->
    <div class="chart-section">
      <div class="chart-header">
        <h3 class="section-heading">Stock Value Evolution & Overlays</h3>
        <div class="time-spans" id="time-span-controls">
          <button type="button" class="span-btn" data-span="1M">1M</button>
          <button type="button" class="span-btn" data-span="3M">3M</button>
          <button type="button" class="span-btn" data-span="6M">6M</button>
          <button type="button" class="span-btn active" data-span="1Y">1Y</button>
          <button type="button" class="span-btn" data-span="5Y">5Y</button>
          <button type="button" class="span-btn" data-span="ALL">ALL</button>
        </div>
      </div>

      <!-- Indicator Overlays Toggles -->
      <div class="overlay-toggles" id="overlay-toggles">
        <span class="overlay-label">Chart Overlays:</span>
        <label class="toggle-chip ${activeOverlays.sma20 ? 'active' : ''}">
          <input type="checkbox" id="chk-sma20" ${activeOverlays.sma20 ? 'checked' : ''} />
          <span class="chip-color chip-cyan"></span> SMA 20
        </label>
        <label class="toggle-chip ${activeOverlays.sma50 ? 'active' : ''}">
          <input type="checkbox" id="chk-sma50" ${activeOverlays.sma50 ? 'checked' : ''} />
          <span class="chip-color chip-amber"></span> SMA 50
        </label>
        <label class="toggle-chip ${activeOverlays.ema20 ? 'active' : ''}">
          <input type="checkbox" id="chk-ema20" ${activeOverlays.ema20 ? 'checked' : ''} />
          <span class="chip-color chip-purple"></span> EMA 20
        </label>
      </div>

      <div class="span-summary-bar" id="span-summary-bar"></div>

      <div class="chart-container">
        <canvas id="stockChart"></canvas>
      </div>
    </div>

    <!-- AI Research Note -->
    <div class="note-section">
      <h3 class="section-heading">AI Research Note (Technical Focus)</h3>
      <div class="note-content">${note.replace(/\n\n/g, '</p><p class="note-content" style="margin-top:0.75rem;">')}</div>
    </div>
  `;

  // Attach event listeners to span buttons
  const controls = document.getElementById('time-span-controls');
  controls.querySelectorAll('.span-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      controls.querySelectorAll('.span-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSpan = btn.dataset.span;
      updateChart(currentPriceData, currentSpan, currentIndicators);
    });
  });

  // Attach event listeners to overlay toggles
  document.getElementById('chk-sma20')?.addEventListener('change', (e) => {
    activeOverlays.sma20 = e.target.checked;
    e.target.parentElement.classList.toggle('active', activeOverlays.sma20);
    updateChart(currentPriceData, currentSpan, currentIndicators);
  });
  document.getElementById('chk-chk-sma50')?.addEventListener('change', (e) => {
    activeOverlays.sma50 = e.target.checked;
    e.target.parentElement.classList.toggle('active', activeOverlays.sma50);
    updateChart(currentPriceData, currentSpan, currentIndicators);
  });
  document.getElementById('chk-sma50')?.addEventListener('change', (e) => {
    activeOverlays.sma50 = e.target.checked;
    e.target.parentElement.classList.toggle('active', activeOverlays.sma50);
    updateChart(currentPriceData, currentSpan, currentIndicators);
  });
  document.getElementById('chk-ema20')?.addEventListener('change', (e) => {
    activeOverlays.ema20 = e.target.checked;
    e.target.parentElement.classList.toggle('active', activeOverlays.ema20);
    updateChart(currentPriceData, currentSpan, currentIndicators);
  });

  // Initial chart render
  updateChart(priceData, currentSpan, indicators);
}

function updateChart(priceData, span, indicators) {
  const filtered = filterDataByTimeSpan(priceData, span);
  if (!filtered.length) return;

  const firstBar = filtered[0];
  const lastBar = filtered[filtered.length - 1];
  const spanChange = lastBar.close - firstBar.close;
  const spanChangePct = firstBar.close ? (spanChange / firstBar.close) * 100 : 0;
  const isUp = spanChange >= 0;

  // Render span summary text
  const summaryEl = document.getElementById('span-summary-bar');
  if (summaryEl) {
    const highVal = Math.max(...filtered.map(b => b.high));
    const lowVal = Math.min(...filtered.map(b => b.low));
    const changeSign = isUp ? '+' : '';
    const spanColor = isUp ? '#34D399' : '#F87171';

    summaryEl.innerHTML = `
      <span>Period: <strong>${firstBar.date}</strong> to <strong>${lastBar.date}</strong></span>
      <span>Range: <strong>$${lowVal.toFixed(2)}</strong> - <strong>$${highVal.toFixed(2)}</strong></span>
      <span>Period Change: <strong style="color: ${spanColor};">${changeSign}$${Math.abs(spanChange).toFixed(2)} (${changeSign}${spanChangePct.toFixed(2)}%)</strong></span>
    `;
  }

  const canvas = document.getElementById('stockChart');
  if (!canvas) return;

  if (currentChartInstance) {
    currentChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  
  const lineColor = isUp ? '#38BDF8' : '#F87171';
  const fillGradient = ctx.createLinearGradient(0, 0, 0, 320);
  if (isUp) {
    fillGradient.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
    fillGradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
  } else {
    fillGradient.addColorStop(0, 'rgba(248, 113, 113, 0.25)');
    fillGradient.addColorStop(1, 'rgba(248, 113, 113, 0.0)');
  }

  // Get slice indices for overlays matching filtered time span
  const startIndex = priceData.findIndex(b => b.date === firstBar.date);
  const endIndex = priceData.findIndex(b => b.date === lastBar.date);

  const labels = filtered.map(b => b.date);
  const dataPoints = filtered.map(b => b.close);

  const datasets = [
    {
      label: `${currentTicker} Close ($)`,
      data: dataPoints,
      borderColor: lineColor,
      borderWidth: 2.2,
      pointRadius: filtered.length > 100 ? 0 : 2,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: lineColor,
      pointHoverBorderColor: '#FFFFFF',
      pointHoverBorderWidth: 2,
      tension: 0.1,
      fill: true,
      backgroundColor: fillGradient
    }
  ];

  if (indicators && indicators.fullArrays) {
    const { sma20, sma50 } = indicators.fullArrays;
    const closes = priceData.map(b => b.close);
    const ema20 = calculateEMA(closes, 20);

    if (activeOverlays.sma20 && sma20) {
      datasets.push({
        label: 'SMA (20)',
        data: sma20.slice(startIndex, endIndex + 1),
        borderColor: '#06B6D4', // Cyan
        borderWidth: 1.8,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        tension: 0.1
      });
    }

    if (activeOverlays.sma50 && sma50) {
      datasets.push({
        label: 'SMA (50)',
        data: sma50.slice(startIndex, endIndex + 1),
        borderColor: '#F59E0B', // Amber
        borderWidth: 1.8,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        tension: 0.1
      });
    }

    if (activeOverlays.ema20) {
      datasets.push({
        label: 'EMA (20)',
        data: ema20.slice(startIndex, endIndex + 1),
        borderColor: '#A855F7', // Purple
        borderWidth: 1.8,
        pointRadius: 0,
        fill: false,
        tension: 0.1
      });
    }
  }

  currentChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#CBD5E1',
            boxWidth: 12,
            boxHeight: 2,
            font: {
              family: "'JetBrains Mono', monospace",
              size: 11
            }
          }
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#F8FAFC',
          bodyColor: '#CBD5E1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              const idx = items[0].dataIndex;
              const bar = filtered[idx];
              return `Date: ${bar.date}`;
            },
            label: (item) => {
              const val = item.raw;
              return `${item.dataset.label}: $${val !== null && val !== undefined ? Number(val).toFixed(2) : 'N/A'}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(51, 65, 85, 0.3)',
            drawBorder: false
          },
          ticks: {
            color: '#94A3B8',
            font: {
              family: "'JetBrains Mono', monospace",
              size: 11
            },
            maxTicksLimit: span === 'ALL' || span === '5Y' ? 8 : 6
          }
        },
        y: {
          position: 'right',
          grid: {
            color: 'rgba(51, 65, 85, 0.3)',
            drawBorder: false
          },
          ticks: {
            color: '#94A3B8',
            font: {
              family: "'JetBrains Mono', monospace",
              size: 11
            },
            callback: (value) => `$${value.toFixed(2)}`
          }
        }
      }
    }
  });
}


