import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const form = document.getElementById('ticker-form');
const results = document.getElementById('results');

let currentChartInstance = null;
let currentPriceData = [];
let currentTicker = '';
let currentSpan = '1Y';

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const ticker = document.getElementById('ticker').value.trim().toUpperCase();
  const twelveDataKey = document.getElementById('twelvedata-key').value.trim();
  const openRouterKey = document.getElementById('openrouter-key').value.trim();

  results.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Fetching market data and running AI equity analysis for <strong>${ticker}</strong>...</p>
    </div>
  `;

  try {
    const priceData = await fetchPriceData(ticker, twelveDataKey);
    const note = await getResearchNote(ticker, priceData, openRouterKey);
    
    currentPriceData = priceData;
    currentTicker = ticker;
    currentSpan = '1Y'; // Default to 1 Year view

    renderResults(ticker, priceData, note);
  } catch (err) {
    results.innerHTML = `<p class="error">Something went wrong: ${err.message}</p>`;
  }
});

// Twelve Data price history with outputsize=2000 to cover 5Y / ALL time spans
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

async function getResearchNote(ticker, priceData, apiKey) {
  const first = priceData[0];
  const latest = priceData[priceData.length - 1];
  const pctChange = ((latest.close - first.close) / first.close) * 100;

  const summary =
    `${ticker} daily closes from ${first.date} to ${latest.date}: ` +
    `start $${first.close.toFixed(2)}, latest $${latest.close.toFixed(2)}, ` +
    `change ${pctChange.toFixed(1)}% over ${priceData.length} trading days. ` +
    `Latest Day Stats: Open $${latest.open.toFixed(2)}, High $${latest.high.toFixed(2)}, Low $${latest.low.toFixed(2)}, Close $${latest.close.toFixed(2)}, Volume ${latest.volume.toLocaleString()}.`;

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
        { role: 'system', content: 'You are a financial research assistant at Oyster Capital. Be concise, rigorous, and factual.' },
        { role: 'user', content: `${summary}\n\nWrite a concise one paragraph research note analyzing the recent stock price evolution and last day market figures for ${ticker}.` }
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
    // Non-JSON response
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

function renderResults(ticker, priceData, note) {
  const latest = priceData[priceData.length - 1];
  const prev = priceData.length > 1 ? priceData[priceData.length - 2] : latest;
  const dayChange = latest.close - prev.close;
  const dayChangePct = prev.close ? (dayChange / prev.close) * 100 : 0;
  
  const isPositive = dayChange >= 0;
  const changeClass = isPositive ? 'pos-change' : 'neg-change';
  const changeSign = isPositive ? '+' : '';

  // Calculate day range slider position (%)
  const dayRangeSpread = latest.high - latest.low;
  const dayRangePos = dayRangeSpread > 0 
    ? Math.min(100, Math.max(0, ((latest.close - latest.low) / dayRangeSpread) * 100))
    : 50;

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

    <!-- Stock Price Evolution Chart -->
    <div class="chart-section">
      <div class="chart-header">
        <h3 class="section-heading">Stock Value Evolution</h3>
        <div class="time-spans" id="time-span-controls">
          <button type="button" class="span-btn" data-span="1M">1M</button>
          <button type="button" class="span-btn" data-span="3M">3M</button>
          <button type="button" class="span-btn" data-span="6M">6M</button>
          <button type="button" class="span-btn active" data-span="1Y">1Y</button>
          <button type="button" class="span-btn" data-span="5Y">5Y</button>
          <button type="button" class="span-btn" data-span="ALL">ALL</button>
        </div>
      </div>

      <div class="span-summary-bar" id="span-summary-bar"></div>

      <div class="chart-container">
        <canvas id="stockChart"></canvas>
      </div>
    </div>

    <!-- AI Intelligence Research Note -->
    <div class="note-section">
      <h3 class="section-heading">AI Research Note</h3>
      <p class="note-content">${note}</p>
    </div>
  `;

  // Attach event listeners to span buttons
  const controls = document.getElementById('time-span-controls');
  controls.querySelectorAll('.span-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      controls.querySelectorAll('.span-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSpan = btn.dataset.span;
      updateChart(currentPriceData, currentSpan);
    });
  });

  // Initial chart render
  updateChart(priceData, currentSpan);
}

function updateChart(priceData, span) {
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
  
  // Gradient fill under chart line
  const lineColor = isUp ? '#38BDF8' : '#F87171';
  const fillGradient = ctx.createLinearGradient(0, 0, 0, 320);
  if (isUp) {
    fillGradient.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    fillGradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
  } else {
    fillGradient.addColorStop(0, 'rgba(248, 113, 113, 0.35)');
    fillGradient.addColorStop(1, 'rgba(248, 113, 113, 0.0)');
  }

  const labels = filtered.map(b => b.date);
  const dataPoints = filtered.map(b => b.close);

  currentChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `${currentTicker} Close ($)`,
        data: dataPoints,
        borderColor: lineColor,
        borderWidth: 2,
        pointRadius: filtered.length > 100 ? 0 : 2,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: lineColor,
        pointHoverBorderColor: '#FFFFFF',
        pointHoverBorderWidth: 2,
        tension: 0.1,
        fill: true,
        backgroundColor: fillGradient
      }]
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
          display: false
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#F8FAFC',
          bodyColor: '#CBD5E1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              const idx = items[0].dataIndex;
              const bar = filtered[idx];
              return `Date: ${bar.date}`;
            },
            label: (item) => {
              const idx = item.dataIndex;
              const bar = filtered[idx];
              return [
                `Close: $${bar.close.toFixed(2)}`,
                `Open:  $${bar.open.toFixed(2)}`,
                `High:  $${bar.high.toFixed(2)}`,
                `Low:   $${bar.low.toFixed(2)}`,
                `Vol:   ${bar.volume.toLocaleString()}`
              ];
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

