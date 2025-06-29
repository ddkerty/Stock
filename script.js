// script.js
let chart;
let stockList = [];
let chartData = {}; // 서버에서 받은 데이터를 저장할 객체
let chartState = { // 차트의 현재 상태를 관리
    isCandlestick: false,
    indicators: {
        mcap: true, // Market Cap
        vwap: true,
        bb: true, // Bollinger Bands
        rsi: true,
        macd: true,
    }
};

// --- DOM Elements ---
const tickerInput = document.getElementById('ticker');
const autocompleteResults = document.getElementById('autocomplete-results');
const analysisOutput = document.getElementById('analysis-output');
const popularStocksContainer = document.getElementById('popular-stocks');
const recentSearchesContainer = document.getElementById('recent-searches');
const indicatorControlsContainer = document.getElementById('indicator-controls');
const chartTypeSwitch = document.getElementById('chart-type-switch');
const skeletonLoader = document.getElementById('skeleton-loader');
const actualContent = document.getElementById('actual-content');
const stockInfoCard = document.getElementById('stock-info-card');
const stockInfoContainer = document.getElementById('stock-info-container');

const popularTickers = [
    { name: '삼성전자', symbol: '005930.KS' },
    { name: 'Apple', symbol: 'AAPL' },
    { name: 'Tesla', symbol: 'TSLA' },
    { name: 'NVIDIA', symbol: 'NVDA' },
    { name: 'SK하이닉스', symbol: '000660.KS' },
];

// --- UI Helper Functions ---
function showLoading(isLoading) {
    if (isLoading) {
        skeletonLoader.classList.remove('d-none');
        actualContent.classList.add('d-none');
        stockInfoCard.classList.add('d-none'); // 정보 카드도 숨김
    } else {
        skeletonLoader.classList.add('d-none');
        actualContent.classList.remove('d-none');
    }
}

function formatMarketCap(mc) {
    if (!mc || typeof mc !== 'number') return "N/A";
    if (mc >= 1e12) return `${(mc / 1e12).toFixed(2)} T`;
    if (mc >= 1e9) return `${(mc / 1e9).toFixed(2)} B`;
    if (mc >= 1e6) return `${(mc / 1e6).toFixed(2)} M`;
    return mc.toLocaleString();
}

function renderStockInfo(info) {
    stockInfoContainer.innerHTML = ''; // Clear previous info

    const metrics = {
        '시가총액': formatMarketCap(info.marketCap),
        'PER (Forward)': info.forwardPE ? info.forwardPE.toFixed(2) : 'N/A',
        'EPS (Trailing)': info.trailingEps ? info.trailingEps.toFixed(2) : 'N/A',
        '배당수익률': info.dividendYield ? `${(info.dividendYield * 100).toFixed(2)}%` : 'N/A',
        '베타': info.beta ? info.beta.toFixed(2) : 'N/A',
        '업종': info.sector || 'N/A',
    };

    const list = document.createElement('dl');
    list.className = 'row';

    for (const [key, value] of Object.entries(metrics)) {
        const dt = document.createElement('dt');
        dt.className = 'col-sm-3';
        dt.textContent = key;
        const dd = document.createElement('dd');
        dd.className = 'col-sm-9';
        dd.textContent = value;
        list.appendChild(dt);
        list.appendChild(dd);
    }
    stockInfoContainer.appendChild(list);

    if (info.longBusinessSummary) {
        const summaryP = document.createElement('p');
        summaryP.className = 'mt-3';
        const shortSummary = info.longBusinessSummary.substring(0, 200);
        summaryP.innerHTML = `${shortSummary}... <a href="#" id="read-more-summary">더보기</a>`;
        
        summaryP.querySelector('#read-more-summary').addEventListener('click', (e) => {
            e.preventDefault();
            summaryP.innerHTML = info.longBusinessSummary;
        });
        stockInfoContainer.appendChild(summaryP);
    }

    stockInfoCard.classList.remove('d-none'); // Show the card
}


function renderPopularStocks() {
    popularStocksContainer.innerHTML = '<span class="text-muted me-2">인기 종목:</span>'; // Clear and add title
    popularTickers.forEach(stock => {
        const button = document.createElement('button');
        button.className = 'btn btn-sm btn-outline-secondary';
        button.textContent = stock.name;
        button.onclick = () => {
            tickerInput.value = stock.symbol;
            document.getElementById('analyze').click();
        };
        popularStocksContainer.appendChild(button);
    });
}

function getRecentSearches() {
    return JSON.parse(localStorage.getItem('recentSearches')) || [];
}

function saveRecentSearch(ticker) {
    let searches = getRecentSearches();
    searches = searches.filter(item => item !== ticker);
    searches.unshift(ticker);
    localStorage.setItem('recentSearches', JSON.stringify(searches.slice(0, 10)));
    renderRecentSearches();
}

function renderRecentSearches() {
    recentSearchesContainer.innerHTML = '<span class="text-muted me-2">최근 검색:</span>'; // Clear and add title
    const searches = getRecentSearches();
    if (searches.length > 0) {
        searches.forEach(ticker => {
            const btnGroup = document.createElement('div');
            btnGroup.className = 'btn-group';
            const button = document.createElement('button');
            button.className = 'btn btn-sm btn-outline-info';
            button.textContent = ticker;
            button.onclick = () => {
                tickerInput.value = ticker;
                document.getElementById('analyze').click();
            };
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-outline-danger';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                removeRecentSearch(ticker);
            };
            btnGroup.appendChild(button);
            btnGroup.appendChild(deleteBtn);
            recentSearchesContainer.appendChild(btnGroup);
        });
    }
}

function removeRecentSearch(ticker) {
    let searches = getRecentSearches();
    searches = searches.filter(item => item !== ticker);
    localStorage.setItem('recentSearches', JSON.stringify(searches));
    renderRecentSearches();
}

function renderIndicatorControls() {
    indicatorControlsContainer.innerHTML = '';
    Object.keys(chartState.indicators).forEach(key => {
        const control = document.createElement('div');
        control.className = 'form-check form-check-inline';
        const input = document.createElement('input');
        input.className = 'form-check-input';
        input.type = 'checkbox';
        input.id = `indicator-${key}`;
        input.checked = chartState.indicators[key];
        input.onchange = () => {
            chartState.indicators[key] = input.checked;
            updateChart();
        };
        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = `indicator-${key}`;
        label.textContent = key.toUpperCase();
        control.appendChild(input);
        control.appendChild(label);
        indicatorControlsContainer.appendChild(control);
    });
}

// --- Data Loading ---
async function loadStockData() {
    try {
        const [krxResponse, nasdaqResponse] = await Promise.all([
            fetch('./krx_stock_list.csv'),
            fetch('./nasdaq_stock_list.csv')
        ]);

        const krxText = await krxResponse.text();
        const nasdaqText = await nasdaqResponse.text();

        const krxData = Papa.parse(krxText, { 
            header: true,
            transformHeader: header => header.trim(),
            skipEmptyLines: true
        }).data.map(stock => ({ Symbol: stock.Symbol, Name: stock.Name }));

        const nasdaqData = Papa.parse(nasdaqText, {
            header: true,
            transformHeader: header => {
                const lowerHeader = header.toLowerCase().trim();
                if (lowerHeader === 'symbol') return 'Symbol';
                if (lowerHeader === 'company name' || lowerHeader === 'security name') return 'Name';
                return header.trim();
            },
            skipEmptyLines: true
        }).data.map(stock => ({ Symbol: stock.Symbol, Name: stock.Name }));

        stockList = [...krxData, ...nasdaqData].filter(stock => stock.Symbol && stock.Name);
        console.log("Total stock list loaded:", stockList.length, "stocks");

    } catch (error) {
        console.error("Error loading stock lists:", error);
        analysisOutput.innerHTML = `<div class="alert alert-danger">Could not load stock lists for autocomplete.</div>`;
    }
}


// --- Autocomplete Logic ---
tickerInput.addEventListener('input', () => {
    const query = tickerInput.value.toLowerCase();
    if (query.length < 1) {
        autocompleteResults.style.display = 'none';
        return;
    }
    const filteredStocks = stockList.filter(stock => 
        (stock.Name && stock.Name.toLowerCase().includes(query)) || 
        (stock.Symbol && stock.Symbol.toLowerCase().includes(query))
    ).slice(0, 10);
    autocompleteResults.innerHTML = '';
    if (filteredStocks.length > 0) {
        filteredStocks.forEach(stock => {
            const item = document.createElement('div');
            item.classList.add('autocomplete-item');
            item.innerHTML = `<span class="stock-name">${stock.Name}</span><span class="stock-symbol">${stock.Symbol}</span>`;
            item.addEventListener('click', () => {
                tickerInput.value = stock.Symbol; // Set symbol directly
                autocompleteResults.style.display = 'none';
            });
            autocompleteResults.appendChild(item);
        });
        autocompleteResults.style.display = 'block';
    } else {
        autocompleteResults.style.display = 'none';
    }
});
document.addEventListener('click', (e) => {
    if (!tickerInput.contains(e.target)) {
        autocompleteResults.style.display = 'none';
    }
});

// --- Technical Analysis Helper Functions (unchanged) ---
const calculateSMA = (data, period) => {
    let sma = [];
    for (let i = period - 1; i < data.length; i++) {
        const subset = data.slice(i - period + 1, i + 1);
        const sum = subset.reduce((a, b) => a + b, 0);
        sma.push(sum / period);
    }
    for (let i = 0; i < period - 1; i++) {
        sma.unshift(null);
    }
    return sma;
};
const calculateStdDev = (data, period) => {
    let stdDev = [];
    for (let i = period - 1; i < data.length; i++) {
        const subset = data.slice(i - period + 1, i + 1);
        const mean = subset.reduce((a, b) => a + b, 0) / period;
        const variance = subset.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
        stdDev.push(Math.sqrt(variance));
    }
    for (let i = 0; i < period - 1; i++) {
        stdDev.unshift(null);
    }
    return stdDev;
};
const calculateBollingerBands = (data, period = 20, stdDevMultiplier = 2) => {
    const middleBand = calculateSMA(data, period);
    const stdDev = calculateStdDev(data, period);
    const upperBand = middleBand.map((sma, i) => sma === null || stdDev[i] === null ? null : sma + (stdDev[i] * stdDevMultiplier));
    const lowerBand = middleBand.map((sma, i) => sma === null || stdDev[i] === null ? null : sma - (stdDev[i] * stdDevMultiplier));
    return { middleBand, upperBand, lowerBand };
};
const calculateRSI = (data, period = 14) => {
    let rsi = [];
    let avgGain = 0, avgLoss = 0;
    let changes = [];
    for (let i = 1; i < data.length; i++) {
        changes.push(data[i] - data[i - 1]);
    }
    let initialGains = 0, initialLosses = 0;
    for (let i = 0; i < period; i++) {
        const change = changes[i];
        if (change > 0) initialGains += change; else initialLosses -= change;
    }
    avgGain = initialGains / period;
    avgLoss = initialLosses / period;
    if (avgLoss === 0) rsi.push(100); else rsi.push(100 - (100 / (1 + avgGain / avgLoss)));
    for (let i = period; i < changes.length; i++) {
        const change = changes[i];
        let gain = change > 0 ? change : 0;
        let loss = change < 0 ? -change : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        if (avgLoss === 0) rsi.push(100); else rsi.push(100 - (100 / (1 + avgGain / avgLoss)));
    }
    for (let i = 0; i < period; i++) {
        rsi.unshift(null);
    }
    return rsi;
};
const calculateEMA = (data, period) => {
    let ema = [];
    const multiplier = 2 / (period + 1);
    for (let i = 0; i < period - 1; i++) ema.push(null);
    const initialSlice = data.slice(0, period);
    if (initialSlice.length === period) {
        const sma = initialSlice.reduce((a, b) => a + b, 0) / period;
        ema.push(sma);
    } else {
        for (let i = 0; i < data.length; i++) ema.push(null);
        return ema;
    }
    for (let i = period; i < data.length; i++) {
        const prevEma = ema[ema.length - 1];
        if (prevEma === null) ema.push(null); else ema.push((data[i] - prevEma) * multiplier + prevEma);
    }
    return ema;
};
const calculateMACD = (data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
    const emaFast = calculateEMA(data, fastPeriod);
    const emaSlow = calculateEMA(data, slowPeriod);
    const macdLine = emaFast.map((fast, i) => fast === null || emaSlow[i] === null ? null : fast - emaSlow[i]);
    const validMacdLine = macdLine.filter(val => val !== null);
    const signalLineRaw = calculateEMA(validMacdLine, signalPeriod);
    const signalLine = [];
    let rawIndex = 0;
    for (let i = 0; i < macdLine.length; i++) {
        if (macdLine[i] === null) signalLine.push(null); else { signalLine.push(signalLineRaw[rawIndex]); rawIndex++; }
    }
    const histogram = macdLine.map((macd, i) => macd === null || signalLine[i] === null ? null : macd - signalLine[i]);
    return { macdLine, signalLine, histogram };
};
const calculateVWAP = (high, low, close, volume) => {
    let cumulativePriceVolume = 0, cumulativeVolume = 0, vwap = [];
    for (let i = 0; i < close.length; i++) {
        if (high[i] === null || low[i] === null || close[i] === null || volume[i] === null || volume[i] === 0) {
            vwap.push(null); continue;
        }
        const typicalPrice = (high[i] + low[i] + close[i]) / 3;
        cumulativePriceVolume += typicalPrice * volume[i];
        cumulativeVolume += volume[i];
        vwap.push(cumulativePriceVolume / cumulativeVolume);
    }
    return vwap;
};

// --- Interpretation Logic ---
const interpretSignals = (latest) => {
    let signals = [];
    // VWAP
    if (latest.close !== null && latest.vwap !== null) {
        if (latest.close > latest.vwap) {
            signals.push({ type: 'positive', text: "<strong>현재가 > VWAP:</strong> 단기 매수세가 우위에 있음을 시사합니다." });
        } else {
            signals.push({ type: 'negative', text: "<strong>현재가 < VWAP:</strong> 단기 매도세가 우위에 있음을 시사합니다." });
        }
    }
    // Bollinger Bands
    if (latest.close !== null && latest.upperBand !== null && latest.lowerBand !== null) {
        if (latest.close > latest.upperBand) {
            signals.push({ type: 'negative', text: "<strong>볼린저 밴드 상단 돌파:</strong> 매우 강한 매수 압력 또는 과매수 상태로, 단기 조정 가능성을 시사합니다." });
        } else if (latest.close < latest.lowerBand) {
            signals.push({ type: 'positive', text: "<strong>볼린저 밴드 하단 이탈:</strong> 과매도 상태로, 기술적 반등의 가능성을 시사합니다." });
        }
    }
    // RSI
    if (latest.rsi !== null) {
        if (latest.rsi > 70) {
            signals.push({ type: 'negative', text: `<strong>RSI > 70 (${latest.rsi.toFixed(1)}):</strong> 과매수 상태입니다. 차익 실현 매물에 주의해야 합니다.` });
        } else if (latest.rsi < 30) {
            signals.push({ type: 'positive', text: `<strong>RSI < 30 (${latest.rsi.toFixed(1)}):</strong> 과매도 상태입니다. 기술적 반등이 나타날 수 있습니다.` });
        } else {
             signals.push({ type: 'neutral', text: `<strong>RSI 중립 (${latest.rsi.toFixed(1)}):</strong> 현재 RSI는 중립 구간에 있습니다.` });
        }
    }
    // MACD
    if (latest.macd !== null && latest.signal !== null) {
        if (latest.macd > latest.signal) {
            signals.push({ type: 'positive', text: "<strong>MACD 골든 크로스:</strong> MACD 선이 신호선을 상향 돌파하여 단기 상승 모멘텀이 강화되고 있습니다." });
        } else {
            signals.push({ type: 'negative', text: "<strong>MACD 데드 크로스:</strong> MACD 선이 신호선을 하향 돌파하여 단기 하락 모멘텀이 강화되고 있습니다." });
        }
    }
    return signals;
};

function renderAnalysisOutput(latestData, signals) {
    analysisOutput.innerHTML = ''; // Clear previous content

    // 1. Summary Cards
    const summaryContainer = document.createElement('div');
    summaryContainer.className = 'row g-3 mb-4';
    
    const summaryMetrics = {
        '현재가': { value: latestData.close },
        'VWAP': { value: latestData.vwap },
        'RSI': { value: latestData.rsi },
        'MACD': { value: latestData.macd }
    };

    for (const [key, metric] of Object.entries(summaryMetrics)) {
        if (metric.value !== null && !isNaN(metric.value)) {
            const col = document.createElement('div');
            col.className = 'col-md-3 col-6';
            const card = document.createElement('div');
            card.className = 'card text-center h-100 shadow-sm';
            const cardBody = document.createElement('div');
            cardBody.className = 'card-body p-2';
            const cardTitle = document.createElement('h6');
            cardTitle.className = 'card-title text-muted small mb-1';
            cardTitle.textContent = key;
            const cardText = document.createElement('p');
            cardText.className = 'card-text fs-5 fw-bold mb-0';
            cardText.textContent = `${metric.value.toFixed(2)}`;
            cardBody.appendChild(cardTitle);
            cardBody.appendChild(cardText);
            card.appendChild(cardBody);
            col.appendChild(card);
            summaryContainer.appendChild(col);
        }
    }
    analysisOutput.appendChild(summaryContainer);

    // 2. Signal List
    const signalList = document.createElement('ul');
    signalList.className = 'list-group list-group-flush';

    if (signals.length > 0) {
        signals.forEach(signal => {
            const listItem = document.createElement('li');
            let icon = '';
            let colorClass = '';

            switch(signal.type) {
                case 'positive': icon = '▲'; colorClass = 'text-success'; break;
                case 'negative': icon = '▼'; colorClass = 'text-danger'; break;
                case 'neutral': icon = '―'; colorClass = 'text-muted'; break;
            }
            
            listItem.className = `list-group-item d-flex align-items-center ${colorClass}`;
            listItem.innerHTML = `<span class="fs-4 me-3 fw-bold">${icon}</span> <div>${signal.text}</div>`;
            signalList.appendChild(listItem);
        });
    } else {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item text-center text-muted';
        listItem.textContent = '현재 뚜렷한 기술적 신호가 감지되지 않았습니다.';
        signalList.appendChild(listItem);
    }
    analysisOutput.appendChild(signalList);
}

async function fetchStockInfo(ticker) {
    try {
        const response = await fetch(`http://localhost:5000/api/stock/info?ticker=${ticker}`);
        if (!response.ok) {
            throw new Error('Failed to fetch stock info');
        }
        const info = await response.json();
        renderStockInfo(info);
    } catch (error) {
        console.error('Error fetching stock info:', error);
        stockInfoContainer.innerHTML = `<div class="alert alert-warning">기업 정보를 불러오는 데 실패했습니다.</div>`;
        stockInfoCard.classList.remove('d-none');
    }
}

// --- Main Application Logic ---
document.getElementById('analyze').addEventListener('click', async () => {
    let userInput = tickerInput.value.toUpperCase();
    if (!userInput) {
        analysisOutput.innerHTML = `<div class="alert alert-warning" role="alert"><strong>알림:</strong> 분석할 종목의 티커를 입력해주세요.</div>`;
        return;
    }
    
    showLoading(true);

    let ticker = userInput;
    // 한국 주식 코드 형식 변환 (.KS, .KQ)
    if (/^[0-9]{6}$/.test(ticker)) {
        const stockInfo = stockList.find(s => s.Symbol === ticker);
        if (stockInfo) {
            ticker = stockInfo.Market === 'KOSDAQ GLOBAL' ? `${ticker}.KQ` : `${ticker}.KS`;
        } else {
            ticker = `${ticker}.KS`; // 기본값으로 .KS 추가
        }
    }

    // Fetch both chart data and stock info in parallel
    const period = document.getElementById('period-select').value;
    const interval = period === '1d' ? '5m' : '1d';
    const chartApiUrl = `http://localhost:5000/api/stock?ticker=${ticker}&range=${period}&interval=${interval}`;

    const chartPromise = fetch(chartApiUrl).then(res => res.json());
    const infoPromise = fetchStockInfo(ticker);

    try {
        const [chartResponse] = await Promise.all([
            chartPromise,
            infoPromise
        ]);

        if (chartResponse.error) {
            throw new Error(chartResponse.details || chartResponse.error);
        }

        const chartResult = chartResponse.chart && chartResponse.chart.result && chartResponse.chart.result[0];

        if (!chartResult || !chartResult.timestamp || !chartResult.indicators.quote[0].close) {
            throw new Error(`<strong>${ticker}</strong>에 대한 차트 데이터를 찾을 수 없습니다.`);
        }

        const timestamps = chartResult.timestamp;
        const quotes = chartResult.indicators.quote[0];
        const marketCapHistory = chartResult.indicators.marketCapHistory ? chartResult.indicators.marketCapHistory[0] : [];
        const dates = timestamps.map(ts => new Date(ts * 1000));
        const prices = quotes.close;
        const ohlc = timestamps.map((ts, i) => ({ x: ts * 1000, o: quotes.open[i], h: quotes.high[i], l: quotes.low[i], c: quotes.close[i] }));
        const validClose = quotes.close.map(v => v === null ? NaN : v);
        const vwap = calculateVWAP(quotes.high.map(v => v === null ? NaN : v), quotes.low.map(v => v === null ? NaN : v), validClose, quotes.volume.map(v => v === null ? NaN : v));
        const { upperBand, lowerBand } = calculateBollingerBands(validClose);
        const rsi = calculateRSI(validClose);
        const { macdLine, signalLine } = calculateMACD(validClose);

        chartData = { ticker, dates, prices, ohlc, marketCapHistory, vwap, upperBand, lowerBand, rsi, macdLine, signalLine };
        updateChart();

        const latestData = { close: prices[prices.length - 1], vwap: vwap[vwap.length - 1], upperBand: upperBand[upperBand.length - 1], lowerBand: lowerBand[lowerBand.length - 1], rsi: rsi[rsi.length - 1], macd: macdLine[macdLine.length - 1], signal: signalLine[signalLine.length - 1] };
        const signals = interpretSignals(latestData);
        renderAnalysisOutput(latestData, signals);

        saveRecentSearch(ticker);
    } catch (error) {
        analysisOutput.innerHTML = `<div class="alert alert-danger" role="alert"><strong>오류 발생:</strong> ${error.message}</div>`;
        if (chart) chart.destroy();
    } finally {
        showLoading(false);
    }
});

chartTypeSwitch.addEventListener('change', (e) => {
    chartState.isCandlestick = e.target.checked;
    updateChart();
});

function updateChart() {
    if (!chartData.dates || chartData.dates.length === 0) return;
    const datasets = [];
    if (chartState.isCandlestick) {
        datasets.push({ label: `${chartData.ticker} Price (OHLC)`, data: chartData.ohlc, type: 'candlestick', yAxisID: 'y' });
    } else {
        datasets.push({ label: `${chartData.ticker} Price`, data: chartData.prices, type: 'line', borderColor: '#0d6efd', yAxisID: 'y', borderWidth: 2, pointRadius: 0, spanGaps: true });
    }
    if (chartState.indicators.mcap && chartData.marketCapHistory && chartData.marketCapHistory.length > 0) {
        datasets.push({ label: 'Market Cap', data: chartData.marketCapHistory, type: 'line', borderColor: '#ffc107', yAxisID: 'y3', borderWidth: 2, pointRadius: 0, spanGaps: true, fill: true, backgroundColor: 'rgba(255, 193, 7, 0.1)' });
    }
    if (chartState.indicators.vwap) datasets.push({ label: 'VWAP', data: chartData.vwap, type: 'line', borderColor: '#dc3545', yAxisID: 'y', borderWidth: 1.5, pointRadius: 0, borderDash: [5, 5], spanGaps: true });
    if (chartState.indicators.bb) {
        datasets.push({ label: 'Upper BB', data: chartData.upperBand, type: 'line', borderColor: '#198754', yAxisID: 'y', borderWidth: 1, pointRadius: 0, spanGaps: true });
        datasets.push({ label: 'Lower BB', data: chartData.lowerBand, type: 'line', borderColor: '#198754', yAxisID: 'y', borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: 'rgba(25, 135, 84, 0.1)', spanGaps: true });
    }
    if (chartState.indicators.rsi) datasets.push({ label: 'RSI', data: chartData.rsi, type: 'line', borderColor: '#6f42c1', yAxisID: 'y1', borderWidth: 1.5, pointRadius: 0, spanGaps: true });
    if (chartState.indicators.macd) {
        datasets.push({ label: 'MACD Line', data: chartData.macdLine, type: 'line', borderColor: '#fd7e14', yAxisID: 'y2', borderWidth: 1.5, pointRadius: 0, spanGaps: true });
        datasets.push({ label: 'Signal Line', data: chartData.signalLine, type: 'line', borderColor: '#0dcaf0', yAxisID: 'y2', borderWidth: 1.5, borderDash: [5, 5], pointRadius: 0, spanGaps: true });
    }
    renderChart(chartData.dates, datasets);
}

function renderChart(dates, datasets) {
    const ctx = document.getElementById('chart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
        data: { labels: dates, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { type: 'timeseries', time: { unit: 'day' } },
                y: { type: 'linear', position: 'left', title: { display: true, text: 'Price' } },
                y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'RSI' }, min: 0, max: 100 },
                y2: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'MACD' } },
                y3: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Market Cap' } }
            },
            plugins: { tooltip: { mode: 'index', intersect: false }, legend: { display: false } },
            interaction: { mode: 'index', intersect: false },
        }
    });
}

// --- Initialize ---
(async () => {
    await loadStockData();
    renderPopularStocks();
    renderRecentSearches();
    renderIndicatorControls();
    showLoading(false); // Initially hide loader
})();