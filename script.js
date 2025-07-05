// script.js (Final Version - Including Neutral Signals)

// --- 전역 변수: 차트 객체, 주식 목록, 현재 데이터 저장소 ---
let chart, statsRadarChart;
let stockList = [];
let currentChartData = {}; // 차트 옵션 변경 시 재사용할 데이터

const chartState = {
    isCandlestick: false,
    indicators: { vwap: true, bb: true, rsi: true, macd: true }
};

// --- DOM 요소 캐싱 ---
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
const fundamentalStatsCard = document.getElementById('fundamental-stats-card');

// --- 인기/최근 검색 데이터 ---
const popularTickers = [
    { name: '삼성전자', symbol: '005930.KS' }, { name: 'Apple', symbol: 'AAPL' },
    { name: 'Tesla', symbol: 'TSLA' }, { name: 'NVIDIA', symbol: 'NVDA' },
    { name: 'SK하이닉스', symbol: '000660.KS' },
];


// --- UI 렌더링 함수 ---

/** 로딩 상태에 따라 스켈레톤 UI와 실제 콘텐츠를 토글합니다. */
function showLoading(isLoading) {
    skeletonLoader.classList.toggle('d-none', !isLoading);
    actualContent.classList.toggle('d-none', isLoading);
    if(isLoading) {
        stockInfoCard.classList.add('d-none');
        fundamentalStatsCard.classList.add('d-none');
    }
}

/** 기업의 기본 정보(이름, 개요 등)를 렌더링합니다. */
function renderStockInfo(info) {
    stockInfoContainer.innerHTML = `
        <h5>${info.longName || '이름 정보 없음'}</h5>
        <p class="text-muted small">${info.sector || ''} / ${info.country || ''}</p>
        <p class="mt-3 small">${info.longBusinessSummary || '기업 개요 정보가 없습니다.'}</p>
    `;
    stockInfoCard.classList.remove('d-none');
}

/** 펀더멘탈 스탯 카드(등급, 점수, 레이더 차트)를 렌더링합니다. */
function renderFundamentalStats(info) {
    if (!info.stats) {
        fundamentalStatsCard.classList.add('d-none');
        return;
    }

    const { stats, rawStats } = info;
    
    document.getElementById('stats-grade').textContent = stats.grade;
    document.getElementById('stats-total-score').textContent = stats.totalScore.toFixed(2);
    document.getElementById('stats-value-score').textContent = stats.scores.value;
    document.getElementById('stats-growth-score').textContent = stats.scores.growth;
    document.getElementById('stats-profitability-score').textContent = stats.scores.profitability;
    document.getElementById('stats-stability-score').textContent = stats.scores.stability;

    document.getElementById('raw-data-list').innerHTML = `
        <li class="list-group-item d-flex justify-content-between small"><strong>Trailing PE:</strong> <span>${rawStats.pe ? rawStats.pe.toFixed(2) : 'N/A'}</span></li>
        <li class="list-group-item d-flex justify-content-between small"><strong>Earnings Growth:</strong> <span>${rawStats.earningsGrowth ? (rawStats.earningsGrowth * 100).toFixed(2) + '%' : 'N/A'}</span></li>
        <li class="list-group-item d-flex justify-content-between small"><strong>ROE:</strong> <span>${rawStats.roe ? (rawStats.roe * 100).toFixed(2) + '%' : 'N/A'}</span></li>
        <li class="list-group-item d-flex justify-content-between small"><strong>Debt to Equity:</strong> <span>${rawStats.debtToEquity ? rawStats.debtToEquity.toFixed(2) : 'N/A'}</span></li>
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
            responsive: true, maintainAspectRatio: false,
            scales: { r: { suggestedMin: 0, suggestedMax: 100, pointLabels: { font: { size: 12 } } } },
            plugins: { legend: { display: false } }
        }
    });

    fundamentalStatsCard.classList.remove('d-none');
}

/** 기술적 지표를 기반으로 한 투자 시그널을 해석하고 출력합니다. (✨ 중립 신호 로직 추가) */
function renderAnalysisOutput(data) {
    const last = (arr) => (arr && arr.length > 0 ? arr.filter(v => v !== null).pop() : null);
    const latest = {
        close: last(data.ohlc.close), vwap: last(data.vwap),
        bb_upper: last(data.bbands.upper), bb_lower: last(data.bbands.lower),
        rsi: last(data.rsi), macd_line: last(data.macd.line), macd_signal: last(data.macd.signal),
    };

    let signals = [];
    
    // RSI 시그널
    if (latest.rsi !== null) {
        if (latest.rsi > 70) signals.push({ type: 'negative', text: `<strong>RSI > 70 (${latest.rsi.toFixed(1)}):</strong> 과매수 상태입니다.` });
        else if (latest.rsi < 30) signals.push({ type: 'positive', text: `<strong>RSI < 30 (${latest.rsi.toFixed(1)}):</strong> 과매도 상태입니다.` });
        else signals.push({ type: 'neutral', text: `<strong>RSI (${latest.rsi.toFixed(1)}):</strong> 중립 구간에 위치하고 있습니다.` });
    }

    // 볼린저 밴드 시그널
    if (latest.close !== null && latest.bb_upper !== null && latest.bb_lower !== null) {
        if (latest.close > latest.bb_upper) signals.push({ type: 'negative', text: '<strong>볼린저 밴드 상단 돌파:</strong> 과매수 또는 단기 조정 가능성.' });
        else if (latest.close < latest.bb_lower) signals.push({ type: 'positive', text: '<strong>볼린저 밴드 하단 이탈:</strong> 과매도, 기술적 반등 가능성.' });
        else signals.push({ type: 'neutral', text: `<strong>볼린저 밴드:</strong> 주가가 밴드 내에서 안정적으로 움직이고 있습니다.` });
    }
    
    // MACD 시그널
    if (latest.macd_line !== null && latest.macd_signal !== null) {
        if (latest.macd_line > latest.macd_signal) signals.push({ type: 'positive', text: '<strong>MACD 골든 크로스:</strong> 단기 상승 모멘텀이 강화되고 있습니다.' });
        else signals.push({ type: 'negative', text: '<strong>MACD 데드 크로스:</strong> 단기 하락 모멘텀이 강화되고 있습니다.' });
    }

    analysisOutput.innerHTML = '';
    const list = document.createElement('ul');
    list.className = 'list-group list-group-flush';
    
    if (signals.length > 0) {
        signals.forEach(signal => {
            const item = document.createElement('li');
            let icon, colorClass;
            switch(signal.type) {
                case 'positive': icon = '▲'; colorClass = 'text-success'; break;
                case 'negative': icon = '▼'; colorClass = 'text-danger'; break;
                case 'neutral': icon = '―'; colorClass = 'text-muted'; break;
            }
            item.className = `list-group-item d-flex align-items-center ${colorClass}`;
            item.innerHTML = `<span class="fs-4 me-3 fw-bold">${icon}</span> <div>${signal.text}</div>`;
            list.appendChild(item);
        });
    } else {
        list.innerHTML = `<li class="list-group-item text-center text-muted">기술적 분석 데이터를 계산할 수 없습니다.</li>`;
    }
    analysisOutput.appendChild(list);
}


// --- 메인 로직 함수 ---

/** '분석하기' 버튼 클릭 시 실행되는 메인 함수 */
async function handleAnalysis() {
    const userInput = tickerInput.value.trim().toUpperCase();
    if (!userInput) {
        analysisOutput.innerHTML = `<div class="alert alert-warning">분석할 종목을 입력해주세요.</div>`;
        return;
    }
    
    showLoading(true);
    analysisOutput.innerHTML = '';

    const ticker = /^[0-9]{6}$/.test(userInput) ? `${userInput}.KS` : userInput;
    const period = document.getElementById('period-select').value;
    const interval = period === '1d' ? '5m' : '1d';

    const chartApiUrl = `/api/stock?ticker=${ticker}&range=${period}&interval=${interval}`;
    const infoApiUrl = `/api/stock/info?ticker=${ticker}`;

    try {
        const [chartRes, infoRes] = await Promise.all([ fetch(chartApiUrl), fetch(infoApiUrl) ]);

        const chartData = await chartRes.json();
        const infoData = await infoRes.json();

        if (chartData.error || infoData.error) {
            throw new Error(chartData.error?.details || infoData.error?.details || '데이터를 가져오지 못했습니다.');
        }

        currentChartData = chartData;
        updateChart(); 
        renderAnalysisOutput(chartData);
        renderStockInfo(infoData);
        renderFundamentalStats(infoData);
        saveRecentSearch(ticker);
    } catch (error) {
        analysisOutput.innerHTML = `<div class="alert alert-danger"><strong>오류:</strong> ${error.message}</div>`;
        if (chart) chart.destroy();
    } finally {
        showLoading(false);
    }
}

/** 차트 옵션 변경 시, API 재호출 없이 차트만 다시 그립니다. */
function updateChart() {
    if (!currentChartData.timestamp) return;

    if (chart) chart.destroy();
    const datasets = [];
    const dates = currentChartData.timestamp.map(ts => new Date(ts * 1000));
    
    if (chartState.isCandlestick) {
        datasets.push({
            label: '주가 (OHLC)',
            data: dates.map((date, i) => ({
                x: date.valueOf(),
                o: currentChartData.ohlc.open[i], h: currentChartData.ohlc.high[i],
                l: currentChartData.ohlc.low[i], c: currentChartData.ohlc.close[i]
            })),
            type: 'candlestick', yAxisID: 'y'
        });
    } else {
        datasets.push({
            label: '주가', data: currentChartData.ohlc.close,
            type: 'line', borderColor: '#0d6efd', yAxisID: 'y', pointRadius: 0, borderWidth: 2, spanGaps: true
        });
    }
    
    if (chartState.indicators.vwap) datasets.push({ label: 'VWAP', data: currentChartData.vwap, type: 'line', borderColor: '#dc3545', yAxisID: 'y', borderWidth: 1.5, pointRadius: 0, borderDash: [5, 5], spanGaps: true });
    if (chartState.indicators.bb) {
        datasets.push({ label: 'Upper BB', data: currentChartData.bbands.upper, type: 'line', borderColor: 'rgba(25, 135, 84, 0.5)', yAxisID: 'y', borderWidth: 1, pointRadius: 0, spanGaps: true });
        datasets.push({ label: 'Lower BB', data: currentChartData.bbands.lower, type: 'line', borderColor: 'rgba(25, 135, 84, 0.5)', yAxisID: 'y', borderWidth: 1, pointRadius: 0, spanGaps: true, fill: '-1', backgroundColor: 'rgba(25, 135, 84, 0.1)'});
    }
    if (chartState.indicators.rsi) datasets.push({ label: 'RSI', data: currentChartData.rsi, type: 'line', borderColor: '#6f42c1', yAxisID: 'y1', pointRadius: 0, borderWidth: 1.5, spanGaps: true });
    if (chartState.indicators.macd) {
        datasets.push({ label: 'MACD', data: currentChartData.macd.line, type: 'line', borderColor: '#fd7e14', yAxisID: 'y2', pointRadius: 0, borderWidth: 1.5, spanGaps: true });
        datasets.push({ label: 'Signal', data: currentChartData.macd.signal, type: 'line', borderColor: '#0dcaf0', yAxisID: 'y2', pointRadius: 0, borderWidth: 1.5, borderDash: [5, 5], spanGaps: true });
    }
    
    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
        data: { labels: dates, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { type: 'timeseries', time: { unit: 'day', tooltipFormat: 'yyyy-MM-dd' }, grid: { display: false } },
                y: { position: 'left', title: { display: true, text: 'Price' } },
                y1: { display: chartState.indicators.rsi, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'RSI' }, min: 0, max: 100 },
                y2: { display: chartState.indicators.macd, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'MACD' } }
            },
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            interaction: { mode: 'index', intersect: false },
        }
    });
}


// --- 초기화 및 이벤트 리스너 ---

/** 페이지 로드 시 실행되는 초기화 함수 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [krxRes, nasdaqRes] = await Promise.all([ fetch('krx_stock_list.csv'), fetch('nasdaq_stock_list.csv') ]);
        const krxText = await krxRes.text();
        const nasdaqText = await nasdaqRes.text();
        const krxData = Papa.parse(krxText, { header: true, skipEmptyLines: true }).data.map(s => ({ Symbol: s.Symbol, Name: s.Name }));
        const nasdaqData = Papa.parse(nasdaqText, { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase() === 'symbol' ? 'Symbol' : 'Name' }).data.map(s => ({ Symbol: s.Symbol, Name: s.Name }));
        stockList = [...krxData, ...nasdaqData].filter(s => s.Symbol && s.Name);
    } catch (e) { 
        console.error("Could not load stock lists:", e); 
        analysisOutput.innerHTML = `<div class="alert alert-danger">종목 목록을 불러오는데 실패했습니다.</div>`;
    }

    document.getElementById('analyze').addEventListener('click', handleAnalysis);
    
    chartTypeSwitch.addEventListener('change', () => {
        chartState.isCandlestick = chartTypeSwitch.checked;
        updateChart();
    });

    renderIndicatorControls();
    renderPopularStocks();
    renderRecentSearches();
    showLoading(false);
});

/** 자동완성 기능: 입력에 따라 주식 목록 필터링 */
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
                tickerInput.value = stock.Symbol;
                autocompleteResults.style.display = 'none';
                handleAnalysis();
            });
            autocompleteResults.appendChild(item);
        });
        autocompleteResults.style.display = 'block';
    } else {
        autocompleteResults.style.display = 'none';
    }
});

/** 외부 클릭 시 자동완성 결과 숨기기 */
document.addEventListener('click', (e) => {
    if (!tickerInput.parentElement.contains(e.target)) {
        autocompleteResults.style.display = 'none';
    }
});


// --- 나머지 헬퍼 함수들 ---

/** 보조지표 컨트롤 UI를 동적으로 생성 */
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
        input.onchange = (e) => {
            chartState.indicators[key] = e.target.checked;
            updateChart();
        };
        const label = document.createElement('label');
        label.className = 'form-check-label small';
        label.htmlFor = `indicator-${key}`;
        label.textContent = key.toUpperCase();
        control.appendChild(input);
        control.appendChild(label);
        indicatorControlsContainer.appendChild(control);
    });
}

/** 인기 종목 버튼들을 렌더링 */
function renderPopularStocks() {
    popularStocksContainer.innerHTML = '<span class="text-muted me-2 small">인기 종목:</span>';
    popularTickers.forEach(stock => {
        const button = document.createElement('button');
        button.className = 'btn btn-sm btn-outline-secondary';
        button.textContent = stock.name;
        button.onclick = () => {
            tickerInput.value = stock.symbol;
            handleAnalysis();
        };
        popularStocksContainer.appendChild(button);
    });
}

/** 로컬 스토리지에서 최근 검색 목록 가져오기 */
function getRecentSearches() {
    return JSON.parse(localStorage.getItem('recentSearches')) || [];
}

/** 최근 검색 목록을 로컬 스토리지에 저장 */
function saveRecentSearch(ticker) {
    let searches = getRecentSearches();
    searches = searches.filter(item => item !== ticker);
    searches.unshift(ticker);
    localStorage.setItem('recentSearches', JSON.stringify(searches.slice(0, 5)));
    renderRecentSearches();
}

/** 최근 검색 목록 UI를 렌더링 */
function renderRecentSearches() {
    recentSearchesContainer.innerHTML = '<span class="text-muted me-2 small">최근 검색:</span>';
    const searches = getRecentSearches();
    searches.forEach(ticker => {
        const btnGroup = document.createElement('div');
        btnGroup.className = 'btn-group me-1';
        const button = document.createElement('button');
        button.className = 'btn btn-sm btn-outline-info';
        button.textContent = ticker;
        button.onclick = () => {
            tickerInput.value = ticker;
            handleAnalysis();
        };
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger py-0 px-1';
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

/** 최근 검색 목록에서 특정 항목 삭제 */
function removeRecentSearch(ticker) {
    let searches = getRecentSearches();
    searches = searches.filter(item => item !== ticker);
    localStorage.setItem('recentSearches', JSON.stringify(searches));
    renderRecentSearches();
}