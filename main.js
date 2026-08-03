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

    const indicators = computeIndicatorsFromInputs(priceData);

    const note = await getResearchNote(ticker, priceData, indicators, openRouterKey);

    renderResults(ticker, priceData, indicators, note);
  } catch (err) {
    results.innerHTML = `<p class="error">Something went wrong: ${err.message}</p>`;
  }
});

function getIndicatorParams() {
  const smaShort = Math.max(2, parseInt(document.getElementById('sma-short-period')?.value || '20', 10));
  const smaLong = Math.max(3, parseInt(document.getElementById('sma-long-period')?.value || '50', 10));
  const ema = Math.max(2, parseInt(document.getElementById('ema-period')?.value || '20', 10));
  const rsi = Math.max(2, parseInt(document.getElementById('rsi-period')?.value || '14', 10));
  const macdFast = Math.max(2, parseInt(document.getElementById('macd-fast')?.value || '12', 10));
  const macdSlow = Math.max(3, parseInt(document.getElementById('macd-slow')?.value || '26', 10));
  const macdSignal = Math.max(2, parseInt(document.getElementById('macd-signal')?.value || '9', 10));

  return { smaShort, smaLong, ema, rsi, macdFast, macdSlow, macdSignal };
}

function computeIndicatorsFromInputs(priceData) {
  const params = getIndicatorParams();
  const closes = priceData.map(b => b.close);

  const smaShortArr = calculateSMA(closes, params.smaShort);
  const smaLongArr = calculateSMA(closes, params.smaLong);
  const emaArr = calculateEMA(closes, params.ema);
  const macdObj = calculateMACD(closes, params.macdFast, params.macdSlow, params.macdSignal);
  const rsiArr = calculateRSI(closes, params.rsi);

  const latestIdx = priceData.length - 1;
  const latestRsi = rsiArr[latestIdx];
  const compound = analyzeCompoundSignal(latestRsi, macdObj);

  return {
    params,
    smaShortVal: smaShortArr[latestIdx],
    smaLongVal: smaLongArr[latestIdx],
    emaVal: emaArr[latestIdx],
    macdLine: macdObj.macdLine[latestIdx],
    macdSignal: macdObj.signalLine[latestIdx],
    macdHist: macdObj.histogram[latestIdx],
    rsiVal: latestRsi,
    compound,
    fullArrays: { smaShortArr, smaLongArr, emaArr, macdObj, rsiArr }
  };
}

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
  const p = indicators.params;

  const techSummary = [
    `SMA(${p.smaShort}): $${indicators.smaShortVal ? indicators.smaShortVal.toFixed(2) : 'N/A'}, SMA(${p.smaLong}): $${indicators.smaLongVal ? indicators.smaLongVal.toFixed(2) : 'N/A'} (${indicators.smaShortVal > indicators.smaLongVal ? 'Golden Alignment' : 'Death Alignment'})`,
    `EMA(${p.ema}): $${indicators.emaVal ? indicators.emaVal.toFixed(2) : 'N/A'}`,
    `MACD (${p.macdFast},${p.macdSlow},${p.macdSignal}): Line $${indicators.macdLine ? indicators.macdLine.toFixed(2) : 'N/A'}, Signal $${indicators.macdSignal ? indicators.macdSignal.toFixed(2) : 'N/A'}, Hist $${indicators.macdHist ? indicators.macdHist.toFixed(2) : 'N/A'}`,
    `RSI (${p.rsi}): ${indicators.rsiVal ? indicators.rsiVal.toFixed(1) : 'N/A'} (${indicators.compound.rsiStatus})`,
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

// Chart instance references & view selection state
let currentPriceChartInstance = null;
let currentMacdChartInstance = null;
let currentRsiChartInstance = null;
let currentChartView = 'all'; // 'all' | 'price' | 'macd' | 'rsi'
let currentIndicators = null;

function renderResults(ticker, priceData, indicators, note) {
  currentTicker = ticker;
  currentPriceData = priceData;
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

  const { compound, smaShortVal, smaLongVal, emaVal, macdLine, macdSignal, macdHist, rsiVal, params } = indicators;

  // Golden cross / Death cross status
  const isGoldenCross = smaShortVal && smaLongVal && smaShortVal > smaLongVal;

  // RSI position gauge percentage
  const rsiGaugePos = rsiVal !== null ? Math.min(100, Math.max(0, rsiVal)) : 50;

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
          <span class="compound-item-label">RSI (${params.rsi}) Signal</span>
          <span class="compound-item-val">${compound.rsiStatus}</span>
          <p class="compound-item-desc">${compound.rsiDetail}</p>
        </div>
        <div class="compound-item">
          <span class="compound-item-label">MACD (${params.macdFast},${params.macdSlow},${params.macdSignal}) Signal</span>
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
            <span class="indicator-title">SMA Moving Averages</span>
            <span class="indicator-status ${isGoldenCross ? 'status-bull' : 'status-bear'}">
              ${isGoldenCross ? 'Golden Alignment' : 'Death Alignment'}
            </span>
          </div>
          <div class="indicator-body">
            <div class="ind-row">
              <span class="ind-name">Short SMA (${params.smaShort})</span>
              <span class="ind-val">$${smaShortVal ? smaShortVal.toFixed(2) : 'N/A'}</span>
            </div>
            <div class="ind-row">
              <span class="ind-name">Long SMA (${params.smaLong})</span>
              <span class="ind-val">$${smaLongVal ? smaLongVal.toFixed(2) : 'N/A'}</span>
            </div>
          </div>
        </div>

        <!-- EMA Card -->
        <div class="indicator-card">
          <div class="indicator-header">
            <span class="indicator-title">EMA Exponential</span>
            <span class="indicator-status status-neutral">
              Trend Gauge
            </span>
          </div>
          <div class="indicator-body">
            <div class="ind-row">
              <span class="ind-name">EMA (${params.ema})</span>
              <span class="ind-val">$${emaVal ? emaVal.toFixed(2) : 'N/A'}</span>
            </div>
          </div>
        </div>

        <!-- MACD Card -->
        <div class="indicator-card">
          <div class="indicator-header">
            <span class="indicator-title">MACD (${params.macdFast}, ${params.macdSlow}, ${params.macdSignal})</span>
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
            <span class="indicator-title">RSI (${params.rsi})</span>
            <span class="indicator-status ${rsiVal >= 70 ? 'status-bear' : rsiVal <= 30 ? 'status-bull' : 'status-neutral'}">
              ${compound.rsiStatus}
            </span>
          </div>
          <div class="indicator-body">
            <div class="ind-row">
              <span class="ind-name">RSI Level</span>
              <span class="ind-val">${rsiVal !== null ? rsiVal.toFixed(1) : 'N/A'} / 100</span>
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

    <!-- Technical Charts Section -->
    <div class="chart-section">
      <div class="chart-header">
        <h3 class="section-heading">Technical Market Charts</h3>
        <div class="time-spans" id="time-span-controls">
          <button type="button" class="span-btn" data-span="1M">1M</button>
          <button type="button" class="span-btn" data-span="3M">3M</button>
          <button type="button" class="span-btn" data-span="6M">6M</button>
          <button type="button" class="span-btn active" data-span="1Y">1Y</button>
          <button type="button" class="span-btn" data-span="5Y">5Y</button>
          <button type="button" class="span-btn" data-span="ALL">ALL</button>
        </div>
      </div>

      <!-- Chart View Selection Tabs -->
      <div class="chart-view-selector">
        <span class="selector-label">Display Chart:</span>
        <div class="view-tabs" id="chart-view-tabs">
          <button type="button" class="view-btn ${currentChartView === 'all' ? 'active' : ''}" data-view="all">Stacked All</button>
          <button type="button" class="view-btn ${currentChartView === 'price' ? 'active' : ''}" data-view="price">Price & Overlays</button>
          <button type="button" class="view-btn ${currentChartView === 'macd' ? 'active' : ''}" data-view="macd">MACD Oscillator</button>
          <button type="button" class="view-btn ${currentChartView === 'rsi' ? 'active' : ''}" data-view="rsi">RSI Oscillator</button>
        </div>
      </div>

      <div class="span-summary-bar" id="span-summary-bar"></div>

      <!-- Main Price Chart Card -->
      <div class="chart-wrapper-card" id="card-price" style="display: ${currentChartView === 'all' || currentChartView === 'price' ? 'block' : 'none'};">
        <div class="chart-card-header">
          <h4 class="chart-card-title"><span class="dot dot-price"></span> Stock Price Movement & Overlays</h4>
          <div class="overlay-toggles" id="overlay-toggles">
            <span class="overlay-label">Overlays:</span>
            <label class="toggle-chip ${activeOverlays.sma20 ? 'active' : ''}">
              <input type="checkbox" id="chk-sma20" ${activeOverlays.sma20 ? 'checked' : ''} />
              <span class="chip-color chip-cyan"></span> Short SMA (${params.smaShort})
            </label>
            <label class="toggle-chip ${activeOverlays.sma50 ? 'active' : ''}">
              <input type="checkbox" id="chk-sma50" ${activeOverlays.sma50 ? 'checked' : ''} />
              <span class="chip-color chip-amber"></span> Long SMA (${params.smaLong})
            </label>
            <label class="toggle-chip ${activeOverlays.ema20 ? 'active' : ''}">
              <input type="checkbox" id="chk-ema20" ${activeOverlays.ema20 ? 'checked' : ''} />
              <span class="chip-color chip-purple"></span> EMA (${params.ema})
            </label>
          </div>
        </div>
        <div class="subchart-canvas-container" style="height: ${currentChartView === 'all' ? '240px' : '320px'};">
          <canvas id="stockChart"></canvas>
        </div>
      </div>

      <!-- Dedicated MACD Chart Card -->
      <div class="chart-wrapper-card" id="card-macd" style="display: ${currentChartView === 'all' || currentChartView === 'macd' ? 'block' : 'none'};">
        <div class="chart-card-header">
          <h4 class="chart-card-title"><span class="dot dot-macd"></span> MACD Indicator Chart (${params.macdFast}, ${params.macdSlow}, ${params.macdSignal})</h4>
          <span class="compound-item-val" style="font-size: 0.78rem;">MACD: ${macdLine !== null ? macdLine.toFixed(2) : 'N/A'} | Signal: ${macdSignal !== null ? macdSignal.toFixed(2) : 'N/A'}</span>
        </div>
        <div class="subchart-canvas-container" style="height: ${currentChartView === 'all' ? '200px' : '300px'};">
          <canvas id="macdChart"></canvas>
        </div>
      </div>

      <!-- Dedicated RSI Chart Card -->
      <div class="chart-wrapper-card" id="card-rsi" style="display: ${currentChartView === 'all' || currentChartView === 'rsi' ? 'block' : 'none'};">
        <div class="chart-card-header">
          <h4 class="chart-card-title"><span class="dot dot-rsi"></span> RSI Oscillator Chart (${params.rsi})</h4>
          <span class="compound-item-val" style="font-size: 0.78rem;">RSI: ${rsiVal !== null ? rsiVal.toFixed(1) : 'N/A'} (${compound.rsiStatus})</span>
        </div>
        <div class="subchart-canvas-container" style="height: ${currentChartView === 'all' ? '200px' : '300px'};">
          <canvas id="rsiChart"></canvas>
        </div>
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
  controls?.querySelectorAll('.span-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      controls.querySelectorAll('.span-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSpan = btn.dataset.span;
      updateAllCharts(currentPriceData, currentSpan, currentIndicators);
    });
  });

  // Attach event listeners to chart view selector tabs
  const viewTabs = document.getElementById('chart-view-tabs');
  viewTabs?.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      viewTabs.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChartView = btn.dataset.view;

      const cardPrice = document.getElementById('card-price');
      const cardMacd = document.getElementById('card-macd');
      const cardRsi = document.getElementById('card-rsi');

      if (cardPrice) cardPrice.style.display = (currentChartView === 'all' || currentChartView === 'price') ? 'block' : 'none';
      if (cardMacd) cardMacd.style.display = (currentChartView === 'all' || currentChartView === 'macd') ? 'block' : 'none';
      if (cardRsi) cardRsi.style.display = (currentChartView === 'all' || currentChartView === 'rsi') ? 'block' : 'none';

      updateAllCharts(currentPriceData, currentSpan, currentIndicators);
    });
  });

  // Attach event listeners to overlay toggles
  document.getElementById('chk-sma20')?.addEventListener('change', (e) => {
    activeOverlays.sma20 = e.target.checked;
    e.target.parentElement.classList.toggle('active', activeOverlays.sma20);
    updateAllCharts(currentPriceData, currentSpan, currentIndicators);
  });
  document.getElementById('chk-sma50')?.addEventListener('change', (e) => {
    activeOverlays.sma50 = e.target.checked;
    e.target.parentElement.classList.toggle('active', activeOverlays.sma50);
    updateAllCharts(currentPriceData, currentSpan, currentIndicators);
  });
  document.getElementById('chk-ema20')?.addEventListener('change', (e) => {
    activeOverlays.ema20 = e.target.checked;
    e.target.parentElement.classList.toggle('active', activeOverlays.ema20);
    updateAllCharts(currentPriceData, currentSpan, currentIndicators);
  });

  // Initial chart render
  updateAllCharts(priceData, currentSpan, indicators);
}

function updateAllCharts(priceData, span, indicators) {
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

  const startIndex = priceData.findIndex(b => b.date === firstBar.date);
  const endIndex = priceData.findIndex(b => b.date === lastBar.date);

  if (currentChartView === 'all' || currentChartView === 'price') {
    renderPriceChart(filtered, priceData, isUp, indicators, startIndex, endIndex);
  }
  if (currentChartView === 'all' || currentChartView === 'macd') {
    renderMacdChart(filtered, priceData, indicators, startIndex, endIndex);
  }
  if (currentChartView === 'all' || currentChartView === 'rsi') {
    renderRsiChart(filtered, priceData, indicators, startIndex, endIndex);
  }
}

function renderPriceChart(filtered, priceData, isUp, indicators, startIndex, endIndex) {
  const canvas = document.getElementById('stockChart');
  if (!canvas) return;

  if (currentPriceChartInstance) {
    currentPriceChartInstance.destroy();
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

  if (indicators && indicators.fullArrays && indicators.params) {
    const { smaShortArr, smaLongArr, emaArr } = indicators.fullArrays;
    const { smaShort, smaLong, ema } = indicators.params;

    if (activeOverlays.sma20 && smaShortArr) {
      datasets.push({
        label: `SMA (${smaShort})`,
        data: smaShortArr.slice(startIndex, endIndex + 1),
        borderColor: '#06B6D4',
        borderWidth: 1.8,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        tension: 0.1
      });
    }

    if (activeOverlays.sma50 && smaLongArr) {
      datasets.push({
        label: `SMA (${smaLong})`,
        data: smaLongArr.slice(startIndex, endIndex + 1),
        borderColor: '#F59E0B',
        borderWidth: 1.8,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        tension: 0.1
      });
    }

    if (activeOverlays.ema20 && emaArr) {
      datasets.push({
        label: `EMA (${ema})`,
        data: emaArr.slice(startIndex, endIndex + 1),
        borderColor: '#A855F7',
        borderWidth: 1.8,
        pointRadius: 0,
        fill: false,
        tension: 0.1
      });
    }
  }

  currentPriceChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#CBD5E1',
            boxWidth: 12,
            boxHeight: 2,
            font: { family: "'JetBrains Mono', monospace", size: 11 }
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
            title: (items) => items.length ? `Date: ${filtered[items[0].dataIndex].date}` : '',
            label: (item) => `${item.dataset.label}: $${item.raw !== null && item.raw !== undefined ? Number(item.raw).toFixed(2) : 'N/A'}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.3)', drawBorder: false },
          ticks: { color: '#94A3B8', font: { family: "'JetBrains Mono', monospace", size: 11 }, maxTicksLimit: 6 }
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(51, 65, 85, 0.3)', drawBorder: false },
          ticks: {
            color: '#94A3B8',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (v) => `$${v.toFixed(2)}`
          }
        }
      }
    }
  });
}

function renderMacdChart(filtered, priceData, indicators, startIndex, endIndex) {
  const canvas = document.getElementById('macdChart');
  if (!canvas) return;

  if (currentMacdChartInstance) {
    currentMacdChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  const labels = filtered.map(b => b.date);

  const { macdObj } = indicators.fullArrays;
  const macdSlice = macdObj.macdLine.slice(startIndex, endIndex + 1);
  const signalSlice = macdObj.signalLine.slice(startIndex, endIndex + 1);
  const histSlice = macdObj.histogram.slice(startIndex, endIndex + 1);

  currentMacdChartInstance = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'MACD Histogram',
          data: histSlice,
          backgroundColor: histSlice.map(v => v >= 0 ? 'rgba(52, 211, 153, 0.7)' : 'rgba(248, 113, 113, 0.7)'),
          borderColor: histSlice.map(v => v >= 0 ? '#34D399' : '#F87171'),
          borderWidth: 1,
          barPercentage: 0.7
        },
        {
          type: 'line',
          label: 'MACD Line',
          data: macdSlice,
          borderColor: '#38BDF8',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.1
        },
        {
          type: 'line',
          label: 'Signal Line',
          data: signalSlice,
          borderColor: '#F59E0B',
          borderWidth: 1.8,
          borderDash: [3, 3],
          pointRadius: 0,
          fill: false,
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#CBD5E1',
            boxWidth: 12,
            boxHeight: 2,
            font: { family: "'JetBrains Mono', monospace", size: 11 }
          }
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#F8FAFC',
          bodyColor: '#CBD5E1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: (items) => items.length ? `Date: ${filtered[items[0].dataIndex].date}` : '',
            label: (item) => `${item.dataset.label}: ${item.raw !== null && item.raw !== undefined ? Number(item.raw).toFixed(2) : 'N/A'}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.3)', drawBorder: false },
          ticks: { color: '#94A3B8', font: { family: "'JetBrains Mono', monospace", size: 11 }, maxTicksLimit: 6 }
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(51, 65, 85, 0.3)', drawBorder: false },
          ticks: {
            color: '#94A3B8',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (v) => v.toFixed(2)
          }
        }
      }
    }
  });
}

function renderRsiChart(filtered, priceData, indicators, startIndex, endIndex) {
  const canvas = document.getElementById('rsiChart');
  if (!canvas) return;

  if (currentRsiChartInstance) {
    currentRsiChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  const labels = filtered.map(b => b.date);

  const { rsiArr } = indicators.fullArrays;
  const rsiSlice = rsiArr.slice(startIndex, endIndex + 1);

  const overboughtLine = new Array(filtered.length).fill(70);
  const oversoldLine = new Array(filtered.length).fill(30);
  const midLine = new Array(filtered.length).fill(50);

  currentRsiChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Overbought (70)',
          data: overboughtLine,
          borderColor: 'rgba(248, 113, 113, 0.75)',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Oversold (30)',
          data: oversoldLine,
          borderColor: 'rgba(52, 211, 153, 0.75)',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Midline (50)',
          data: midLine,
          borderColor: 'rgba(148, 163, 184, 0.4)',
          borderWidth: 1,
          borderDash: [2, 4],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'RSI Oscillator',
          data: rsiSlice,
          borderColor: '#A855F7',
          borderWidth: 2,
          pointRadius: filtered.length > 100 ? 0 : 2,
          pointHoverRadius: 5,
          tension: 0.1,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#CBD5E1',
            boxWidth: 12,
            boxHeight: 2,
            font: { family: "'JetBrains Mono', monospace", size: 11 }
          }
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#F8FAFC',
          bodyColor: '#CBD5E1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: (items) => items.length ? `Date: ${filtered[items[0].dataIndex].date}` : '',
            label: (item) => `${item.dataset.label}: ${item.raw !== null && item.raw !== undefined ? Number(item.raw).toFixed(1) : 'N/A'}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(51, 65, 85, 0.3)', drawBorder: false },
          ticks: { color: '#94A3B8', font: { family: "'JetBrains Mono', monospace", size: 11 }, maxTicksLimit: 6 }
        },
        y: {
          position: 'right',
          min: 0,
          max: 100,
          grid: { color: 'rgba(51, 65, 85, 0.3)', drawBorder: false },
          ticks: {
            color: '#94A3B8',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            stepSize: 20,
            callback: (v) => `${v}`
          }
        }
      }
    }
  });
}

// Live update indicators when user modifies parameter inputs while stock data is active
const paramInputIds = [
  'sma-short-period',
  'sma-long-period',
  'ema-period',
  'rsi-period',
  'macd-fast',
  'macd-slow',
  'macd-signal'
];

paramInputIds.forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    if (currentPriceData && currentPriceData.length) {
      const updatedIndicators = computeIndicatorsFromInputs(currentPriceData);
      currentIndicators = updatedIndicators;
      
      // Update DOM values without clearing research note
      const existingNote = document.querySelector('.note-content')?.innerText || '';
      renderResults(currentTicker, currentPriceData, updatedIndicators, existingNote);
    }
  });
});


