// script.js (Final Version - All Features Included)

// --- 전역 변수 ---
let chart, statsRadarChart;
let stockList = [];
let currentChartData = {};

const chartState = {
    isCandlestick: false,
    indicators: { vwap: true, bb: true, rsi: true, macd: true }
};

// --- DOM 요소 캐싱 ---
const tickerInput = document.getElementById('ticker');
const autocompleteResults = document.getElementById('autocomplete-results');
const popularStocksContainer = document.getElementById('popular-stocks-container');
const recentSearchesContainer = document.getElementById('recent-searches-container');
const indicatorControlsContainer = document.getElementById('indicator-controls');
const chartTypeSwitch = document.getElementById('chart-type-switch');
const loaderContainer = document.getElementById('loader-container');
const actualContent = document.getElementById('actual-content');
const stockInfoCard = document.getElementById('stock-info-card');
const stockInfoContainer = document.getElementById('stock-info-container');
const fundamentalStatsCard = document.getElementById('fundamental-stats-card');
const technicalAnalysisCard = document.getElementById('technical-analysis-card');
const technicalAnalysisContainer = document.getElementById('technical-analysis-container');
const darkModeSwitch = document.getElementById('dark-mode-switch');
const darkModeLabel = document.getElementById('dark-mode-label');

// --- 데이터 ---
const popularTickers = [
    { name: '삼성전자', symbol: '005930.KS' }, { name: 'Apple', symbol: 'AAPL' },
    { name: 'Tesla', symbol: 'TSLA' }, { name: 'NVIDIA', symbol: 'NVDA' },
    { name: 'SK하이닉스', symbol: '000660.KS' },
];


// --- UI 렌더링 함수 ---

function showLoading(isLoading) {
    loaderContainer.classList.toggle('d-none', !isLoading);
    actualContent.classList.toggle('d-none', isLoading);
    if (isLoading) {
        [stockInfoCard, fundamentalStatsCard, technicalAnalysisCard].forEach(card => card.classList.add('d-none'));
    }
}

function renderStockInfo(info) {
    stockInfoContainer.innerHTML = `
        <h6 class="card-title">${info.longName || '이름 정보 없음'}</h6>
        <p class="card-subtitle mb-2 text-muted small">${info.sector || ''} / ${info.country || ''}</p>
        <p class="card-text small mt-3" style="max-height: 200px; overflow-y: auto;">${info.longBusinessSummary || '기업 개요 정보가 없습니다.'}</p>
    `;
    stockInfoCard.classList.remove('d-none');
}

function renderTechnicalAnalysisCard(data) {
    const last = (arr) => {
        // 배열이 없거나 비어있는 경우 null 반환
        if (!arr || !Array.isArray(arr) || arr.length === 0) {
            return null;
        }
        // null이 아닌 값들만 필터링
        const filtered = arr.filter(v => v !== null);
        // 필터링 후 배열이 비어있다면 null 반환 (모든 값이 null이었던 경우)
        if (filtered.length === 0) {
            return null;
        }
        // 마지막 유효한 값 반환
        return filtered[filtered.length - 1];
    };
    const latest = {
        close: last(data.ohlc.close), rsi: last(data.rsi), macd_line: last(data.macd.line),
        macd_signal: last(data.macd.signal), bb_upper: last(data.bbands.upper), bb_lower: last(data.bbands.lower),
    };

    let signals = [];
    if (latest.rsi !== null) {
        if (latest.rsi > 70) signals.push({ type: 'negative', text: `<strong>RSI (${latest.rsi.toFixed(1)}):</strong> 과매수` });
        else if (latest.rsi < 30) signals.push({ type: 'positive', text: `<strong>RSI (${latest.rsi.toFixed(1)}):</strong> 과매도` });
        else signals.push({ type: 'neutral', text: `<strong>RSI (${latest.rsi.toFixed(1)}):</strong> 중립` });
    }
    if (latest.close !== null && latest.bb_upper !== null) {
        if (latest.close > latest.bb_upper) signals.push({ type: 'negative', text: '<strong>볼린저 밴드:</strong> 상단 돌파' });
        else if (latest.close < latest.bb_lower) signals.push({ type: 'positive', text: '<strong>볼린저 밴드:</strong> 하단 이탈' });
        else signals.push({ type: 'neutral', text: '<strong>볼린저 밴드:</strong> 밴드 내 위치' });
    }
    if (latest.macd_line !== null && latest.macd_signal !== null) {
        if (latest.macd_line > latest.macd_signal) signals.push({ type: 'positive', text: '<strong>MACD:</strong> 골든 크로스' });
        else signals.push({ type: 'negative', text: '<strong>MACD:</strong> 데드 크로스' });
    }

    let signalHtml = `<li class="list-group-item text-center text-muted small">신호 없음</li>`;
    if (signals.length > 0) {
        signalHtml = signals.map(signal => {
            let icon, colorClass;
            switch (signal.type) {
                case 'positive': icon = '▲'; colorClass = 'text-success'; break;
                case 'negative': icon = '▼'; colorClass = 'text-danger'; break;
                default: icon = '―'; colorClass = 'text-muted'; break;
            }
            return `<li class="list-group-item d-flex align-items-center ${colorClass} small py-2"><span class="fs-5 me-2 fw-bold">${icon}</span> ${signal.text}</li>`;
        }).join('');
    }

    technicalAnalysisContainer.innerHTML = `<ul class="list-group list-group-flush">${signalHtml}</ul>`;
    technicalAnalysisCard.classList.remove('d-none');
}

function renderFundamentalStats(info) {
    if (!info.stats) {
        fundamentalStatsCard.classList.add('d-none');
        return;
    }
    const { stats, rawStats } = info;
    const gradeBadge = document.getElementById('stats-grade');
    gradeBadge.textContent = stats.grade;
    const gradeColors = { "A (매우 우수)": 'bg-danger', "B (우수)": 'bg-primary', "C (보통)": 'bg-success', "D (주의)": 'bg-warning', "F (위험)": 'bg-secondary' };
    gradeBadge.className = `badge fs-5 ${gradeColors[stats.grade] || 'bg-dark'}`;

    const rawDataList = document.getElementById('raw-data-list');
    rawDataList.innerHTML = `
        <li class="list-group-item d-flex justify-content-between align-items-center small py-1"><strong>종합 점수:</strong> <span class="badge bg-dark rounded-pill">${stats.totalScore.toFixed(2)}</span></li>
        <li class="list-group-item d-flex justify-content-between align-items-center small py-1">${rawStats.pe_type || 'PE'}: <span>${rawStats.pe ? rawStats.pe.toFixed(2) : 'N/A'}</span></li>
        <li class="list-group-item d-flex justify-content-between align-items-center small py-1">ROE: <span>${rawStats.roe ? (rawStats.roe * 100).toFixed(2) + '%' : 'N/A'}</span></li>
    `;

    const ctx = document.getElementById('stats-radar-chart').getContext('2d');
    if (statsRadarChart) statsRadarChart.destroy();
    statsRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['가치', '성장성', '수익성', '안정성'],
            datasets: [{
                label: '펀더멘탈 스탯',
                data: [stats.scores.value, stats.scores.growth, stats.scores.profitability, stats.scores.stability],
                backgroundColor: 'rgba(25, 135, 84, 0.2)',
                borderColor: 'rgb(25, 135, 84)',
                borderWidth: 2,
                pointBackgroundColor: 'rgb(25, 135, 84)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    suggestedMin: 0,
                    suggestedMax: 100,
                    pointLabels: { font: { size: 12 } },
                    ticks: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
    fundamentalStatsCard.classList.remove('d-none');
}

// --- 메인 로직 및 차트 함수 ---
async function handleAnalysis() {
    const userInput = tickerInput.value.trim().toUpperCase();
    if (!userInput) return;
    showLoading(true);

    const ticker = /^[0-9]{6}$/.test(userInput) ? `${userInput}.KS` : userInput;
    const period = document.getElementById('period-select').value;
    const interval = '1d';
    const chartApiUrl = `/api/stock?ticker=${ticker}&range=${period}&interval=${interval}`;
    const infoApiUrl = `/api/stock/info?ticker=${ticker}`;

    try {
        const [chartRes, infoRes] = await Promise.all([fetch(chartApiUrl), fetch(infoApiUrl)]);
        const chartData = await chartRes.json();
        const infoData = await infoRes.json();
        if (chartData.error || infoData.error) {
            throw new Error(chartData.error?.details || infoData.error?.details || '데이터를 가져오지 못했습니다.');
        }
        currentChartData = chartData;
        updateChart();
        renderTechnicalAnalysisCard(chartData);
        renderStockInfo(infoData);
        renderFundamentalStats(infoData);
        saveRecentSearch(ticker);
    } catch (error) {
        technicalAnalysisCard.classList.remove('d-none');
        technicalAnalysisContainer.innerHTML = `<div class="alert alert-danger small p-2 m-0">${error.message}</div>`;
        if (chart) chart.destroy();
    } finally {
        showLoading(false);
    }
}

function updateChart() {
    if (!currentChartData.timestamp) return;
    if (chart) chart.destroy();

    const isDarkMode = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    const textColor = isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    const datasets = [];
    const dates = currentChartData.timestamp.map(ts => new Date(ts * 1000));
    if (chartState.isCandlestick) {
        datasets.push({
            label: '주가', type: 'candlestick', yAxisID: 'y',
            data: dates.map((date, i) => ({
                x: date.valueOf(),
                o: currentChartData.ohlc.open[i], h: currentChartData.ohlc.high[i],
                l: currentChartData.ohlc.low[i], c: currentChartData.ohlc.close[i]
            }))
        });
    } else {
        datasets.push({ label: '주가', type: 'line', yAxisID: 'y', data: currentChartData.ohlc.close, borderColor: '#0d6efd', pointRadius: 0, borderWidth: 2, spanGaps: true });
    }

    if (chartState.indicators.vwap) datasets.push({ label: 'VWAP', type: 'line', yAxisID: 'y', data: currentChartData.vwap, borderColor: '#dc3545', borderWidth: 1.5, pointRadius: 0, borderDash: [5, 5], spanGaps: true });
    if (chartState.indicators.bb) {
        datasets.push({ label: 'Upper BB', type: 'line', yAxisID: 'y', data: currentChartData.bbands.upper, borderColor: 'rgba(25, 135, 84, 0.5)', borderWidth: 1, pointRadius: 0, spanGaps: true });
        datasets.push({ label: 'Lower BB', type: 'line', yAxisID: 'y', data: currentChartData.bbands.lower, borderColor: 'rgba(25, 135, 84, 0.5)', borderWidth: 1, pointRadius: 0, spanGaps: true, fill: '-1', backgroundColor: 'rgba(25, 135, 84, 0.1)' });
    }
    if (chartState.indicators.rsi) datasets.push({ label: 'RSI', type: 'line', yAxisID: 'y1', data: currentChartData.rsi, borderColor: '#6f42c1', pointRadius: 0, borderWidth: 1.5, spanGaps: true });
    if (chartState.indicators.macd) {
        datasets.push({ label: 'MACD', type: 'line', yAxisID: 'y2', data: currentChartData.macd.line, borderColor: '#fd7e14', pointRadius: 0, borderWidth: 1.5, spanGaps: true });
        datasets.push({ label: 'Signal', type: 'line', yAxisID: 'y2', data: currentChartData.macd.signal, borderColor: '#0dcaf0', pointRadius: 0, borderWidth: 1.5, borderDash: [5, 5], spanGaps: true });
    }

    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
        data: { labels: dates, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { type: 'timeseries', time: { unit: 'day', tooltipFormat: 'yyyy-MM-dd' }, grid: { color: gridColor }, ticks: { color: textColor } },
                y: { position: 'left', title: { display: true, text: 'Price', color: textColor }, grid: { color: gridColor }, ticks: { color: textColor } },
                y1: { display: chartState.indicators.rsi, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'RSI', color: textColor }, ticks: { color: textColor }, min: 0, max: 100 },
                y2: { display: chartState.indicators.macd, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'MACD', color: textColor }, ticks: { color: textColor } }
            },
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            interaction: { mode: 'index', intersect: false }
        }
    });
}


// --- 초기화 및 나머지 헬퍼 함수들 ---

document.addEventListener('DOMContentLoaded', async () => {
    applyTheme(localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    try {
        const [krxRes, nasdaqRes] = await Promise.all([fetch('krx_stock_list.csv'), fetch('nasdaq_stock_list.csv')]);
        const [krxText, nasdaqText] = await Promise.all([krxRes.text(), nasdaqRes.text()]);
        const krxData = Papa.parse(krxText, { header: true, skipEmptyLines: true }).data.map(s => ({ Symbol: s.Symbol, Name: s.Name }));
        const nasdaqData = Papa.parse(nasdaqText, { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase() === 'symbol' ? 'Symbol' : 'Name' }).data.map(s => ({ Symbol: s.Symbol, Name: s.Name }));
        stockList = [...krxData, ...nasdaqData].filter(s => s.Symbol && s.Name);
    } catch (e) { console.error("Could not load stock lists:", e); }
    
    document.getElementById('analyze').addEventListener('click', handleAnalysis);
    chartTypeSwitch.addEventListener('change', () => { chartState.isCandlestick = chartTypeSwitch.checked; updateChart(); });
    darkModeSwitch.addEventListener('change', (e) => applyTheme(e.target.checked ? 'dark' : 'light'));
    
    renderIndicatorControls();
    renderPopularStocks();
    renderRecentSearches();
    showLoading(false);
});

tickerInput.addEventListener('input', () => {
    const query = tickerInput.value.toLowerCase();
    if (query.length < 1) { autocompleteResults.style.display = 'none'; return; }
    const filteredStocks = stockList.filter(stock => (stock.Name && stock.Name.toLowerCase().includes(query)) || (stock.Symbol && stock.Symbol.toLowerCase().includes(query))).slice(0, 10);
    autocompleteResults.innerHTML = '';
    if (filteredStocks.length > 0) {
        filteredStocks.forEach(stock => {
            const item = document.createElement('div');
            item.classList.add('autocomplete-item');
            item.innerHTML = `<span class="stock-name">${stock.Name}</span><span class="stock-symbol">${stock.Symbol}</span>`;
            item.addEventListener('click', () => { tickerInput.value = stock.Symbol; autocompleteResults.style.display = 'none'; handleAnalysis(); });
            autocompleteResults.appendChild(item);
        });
        autocompleteResults.style.display = 'block';
    } else { autocompleteResults.style.display = 'none'; }
});

document.addEventListener('click', (e) => { if (tickerInput.parentElement && !tickerInput.parentElement.contains(e.target)) { autocompleteResults.style.display = 'none'; } });

function renderIndicatorControls() {
    indicatorControlsContainer.innerHTML = '';
    Object.keys(chartState.indicators).forEach(key => {
        const control = document.createElement('div'); control.className = 'form-check form-check-inline';
        const input = document.createElement('input'); input.className = 'form-check-input'; input.type = 'checkbox'; input.id = `indicator-${key}`; input.checked = chartState.indicators[key];
        input.onchange = (e) => { chartState.indicators[key] = e.target.checked; updateChart(); };
        const label = document.createElement('label'); label.className = 'form-check-label small'; label.htmlFor = `indicator-${key}`; label.textContent = key.toUpperCase();
        control.appendChild(input); control.appendChild(label);
        indicatorControlsContainer.appendChild(control);
    });
}

function renderPopularStocks() {
    popularStocksContainer.innerHTML = '<span class="text-muted me-2 small">인기 종목:</span>';
    const container = document.createElement('div'); container.className = 'd-flex flex-wrap gap-2';
    popularTickers.forEach(stock => {
        const button = document.createElement('button'); button.className = 'btn btn-sm btn-outline-secondary'; button.textContent = stock.name;
        button.onclick = () => { tickerInput.value = stock.symbol; handleAnalysis(); };
        container.appendChild(button);
    });
    popularStocksContainer.appendChild(container);
}

function getRecentSearches() { try { return JSON.parse(localStorage.getItem('recentSearches')) || []; } catch (e) { return []; } }

function saveRecentSearch(ticker) {
    let searches = getRecentSearches();
    searches = searches.filter(item => item !== ticker);
    searches.unshift(ticker);
    localStorage.setItem('recentSearches', JSON.stringify(searches.slice(0, 5)));
    renderRecentSearches();
}

function renderRecentSearches() {
    recentSearchesContainer.innerHTML = '<span class="text-muted me-2 small">최근 검색:</span>';
    const container = document.createElement('div'); container.className = 'd-flex flex-wrap gap-2';
    const searches = getRecentSearches();
    if (searches.length === 0) {
        recentSearchesContainer.style.display = 'none'; // 최근 검색 기록이 없으면 숨김
        if (popularStocksContainer.children.length > 0) popularStocksContainer.classList.remove('mb-2'); // 여백 조정
        return;
    }
    recentSearchesContainer.style.display = 'flex';
    if (popularStocksContainer.children.length > 0) popularStocksContainer.classList.add('mb-2'); // 여백 조정

    searches.forEach(ticker => {
        const btnGroup = document.createElement('div'); btnGroup.className = 'btn-group';
        const button = document.createElement('button'); button.className = 'btn btn-sm btn-outline-info'; button.textContent = ticker;
        button.onclick = () => { tickerInput.value = ticker; handleAnalysis(); };
        const deleteBtn = document.createElement('button'); deleteBtn.className = 'btn btn-sm btn-outline-danger py-0 px-1'; deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = (e) => { e.stopPropagation(); removeRecentSearch(ticker); };
        btnGroup.appendChild(button); btnGroup.appendChild(deleteBtn); container.appendChild(btnGroup);
    });
    recentSearchesContainer.appendChild(container);
}

function removeRecentSearch(ticker) {
    let searches = getRecentSearches();
    searches = searches.filter(item => item !== ticker);
    localStorage.setItem('recentSearches', JSON.stringify(searches));
    renderRecentSearches();
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
    darkModeSwitch.checked = theme === 'dark';
    // 아이콘 변경 로직은 유지하되, 레이블 텍스트는 HTML에 고정되어 있으므로 JS에서 제거합니다.
    if (currentChartData.timestamp) {
        updateChart();
    }
}