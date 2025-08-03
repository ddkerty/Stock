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
const periodSelect = document.getElementById('period-select');
const intervalSelect = document.getElementById('interval-select');


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

/**
 * ## 여기가 완전히 새로워진 최종 분석 엔진입니다! ##
 * 어떤 상황에서도 5개의 모든 기술 지표 상태를 표시하도록 수정되었습니다.
 * @param {object} data - 서버로부터 받은 차트 및 지표 데이터
 */
function renderTechnicalAnalysisCard(data) {
    const signals = [];
    let summaryScore = 0;

    const lastN = (arr, n) => (arr ? arr.filter(v => v !== null).slice(-n) : []);
    const [prevClose, latestClose] = lastN(data.ohlc.close, 2);
    
    // --- 1. 피보나치 되돌림 분석 ---
    const validHighs = data.ohlc.high.filter(v => v !== null);
    const validLows = data.ohlc.low.filter(v => v !== null);
    if (validHighs.length > 1 && validLows.length > 1 && latestClose !== undefined) {
        const high = Math.max(...validHighs);
        const low = Math.min(...validLows);
        const diff = high - low;
        let fibSignalFound = false;
        if (diff > 1e-9) {
            const levels = {
                0.0: high, 0.236: high - 0.236 * diff, 0.382: high - 0.382 * diff,
                0.5: high - 0.5 * diff, 0.618: high - 0.618 * diff, 1.0: low,
            };
            for (const [ratio, lvl_price] of Object.entries(levels)) {
                if (Math.abs(latestClose - lvl_price) / diff < 0.02) {
                    const comments = { 0.236: "얕은 되돌림 후 강세 재개 가능성", 0.382: "첫 번째 핵심 지지선", 0.5: "추세 중립 전환 분기점", 0.618: "되돌림의 마지막 보루", 1.0: "저점 지지 테스트 중", 0.0: "고점 부근, 차익 실현 압력 주의" };
                    const text = comments[ratio] || `피보나치 ${Number(ratio).toFixed(3)} 레벨 근처`;
                    signals.push({ type: 'neutral', text: `🔍 **피보나치:** ${text} ($${lvl_price.toFixed(2)})`, score: 0 });
                    fibSignalFound = true;
                    break;
                }
            }
        }
        if (!fibSignalFound) {
            signals.push({ type: 'neutral', text: `🔍 **피보나치:** 주요 레벨과 이격 상태`, score: 0 });
        }
    } else {
        signals.push({ type: 'neutral', text: `🔍 **피보나치:** 분석 데이터 부족`, score: 0 });
    }

    // --- 2. VWAP 분석 ---
    const latestVwap = lastN(data.vwap, 1)[0];
    if (latestClose !== undefined && latestVwap !== undefined) {
        if (latestClose > latestVwap) {
            signals.push({ type: 'positive', text: '📈 **VWAP:** 현재가 위 (단기 매수세 우위)', score: 0.5 });
        } else {
            signals.push({ type: 'negative', text: '📉 **VWAP:** 현재가 아래 (단기 매도세 우위)', score: -0.5 });
        }
    } else {
        signals.push({ type: 'neutral', text: '↔️ **VWAP:** 신호 없음', score: 0 });
    }

    // --- 3. 볼린저 밴드 분석 ---
    const latestUpper = lastN(data.bbands.upper, 1)[0];
    const latestLower = lastN(data.bbands.lower, 1)[0];
    if (latestClose !== undefined && latestUpper !== undefined && latestLower !== undefined) {
        if (latestClose > latestUpper) {
            signals.push({ type: 'positive', text: '🚨 **볼린저밴드:** 상단 돌파 (강세 신호)', score: 1.5 });
        } else if (latestClose < latestLower) {
            signals.push({ type: 'negative', text: '📉 **볼린저밴드:** 하단 이탈 (약세 신호)', score: -1.5 });
        } else {
            signals.push({ type: 'neutral', text: '↔️ **볼린저밴드:** 밴드 내 위치 (신호 없음)', score: 0 });
        }
    } else {
        signals.push({ type: 'neutral', text: '↔️ **볼린저밴드:** 신호 없음', score: 0 });
    }

    // --- 4. RSI 분석 ---
    const latestRsi = lastN(data.rsi, 1)[0];
    if (latestRsi !== undefined) {
        if (latestRsi > 70) {
            signals.push({ type: 'negative', text: `📈 **RSI (${latestRsi.toFixed(1)}):** 과매수 영역`, score: -1 });
        } else if (latestRsi < 30) {
            signals.push({ type: 'positive', text: `📉 **RSI (${latestRsi.toFixed(1)}):** 과매도 영역`, score: 1 });
        } else {
            signals.push({ type: 'neutral', text: `↔️ **RSI (${latestRsi.toFixed(1)}):** 중립 구간 (신호 없음)`, score: 0 });
        }
    } else {
        signals.push({ type: 'neutral', text: '↔️ **RSI:** 신호 없음', score: 0 });
    }

    // --- 5. MACD 분석 ---
    const [prevMacd, latestMacd] = lastN(data.macd.line, 2);
    const [prevSignal, latestSignal] = lastN(data.macd.signal, 2);
     if (latestMacd !== undefined && prevMacd !== undefined && latestSignal !== undefined && prevSignal !== undefined) {
        const wasAbove = prevMacd > prevSignal;
        const isAbove = latestMacd > latestSignal;
        if (isAbove && !wasAbove) {
            signals.push({ type: 'positive', text: '🟢 **MACD:** 골든 크로스 발생!', score: 2 });
        } else if (!isAbove && wasAbove) {
            signals.push({ type: 'negative', text: '🔴 **MACD:** 데드 크로스 발생!', score: -2 });
        } else {
            signals.push({ type: 'neutral', text: `↔️ **MACD:** 교차 신호 없음 (${isAbove ? '상승' : '하락'} 추세 유지)`, score: 0 });
        }
    } else {
        signals.push({ type: 'neutral', text: '↔️ **MACD:** 신호 없음', score: 0 });
    }
    
    // --- 6. 종합 의견 생성 ---
    summaryScore = signals.reduce((acc, signal) => acc + signal.score, 0);
    let summary;
    if (signals.length < 5) summary = { text: '분석 불가', detail: '기술적 신호를 계산하기에 데이터가 부족합니다.', type: 'neutral' };
    else if (summaryScore >= 3) summary = { text: '강력 매수 고려', detail: '다수의 강력한 긍정 신호가 포착되었습니다.', type: 'positive' };
    else if (summaryScore >= 1) summary = { text: '매수 우위', detail: '긍정적인 신호가 우세합니다.', type: 'positive' };
    else if (summaryScore > -1) summary = { text: '중립 / 혼조세', detail: '신호가 엇갈리거나 뚜렷한 방향성이 없습니다.', type: 'neutral' };
    else if (summaryScore > -3) summary = { text: '매도 우위', detail: '부정적인 신호가 우세합니다.', type: 'negative' };
    else summary = { text: '강력 매도 고려', detail: '다수의 강력한 부정 신호가 포착되었습니다.', type: 'negative' };

    // --- 7. HTML 렌더링 ---
    const signalHtml = signals.map(signal => {
        let colorClass;
        switch (signal.type) {
            case 'positive': colorClass = 'text-success'; break;
            case 'negative': colorClass = 'text-danger'; break;
            default: colorClass = 'text-muted'; break;
        }
        const formattedText = signal.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return `<li class="list-group-item ${colorClass} small py-2">${formattedText}</li>`;
    }).join('');

    const summaryColorClasses = { positive: 'bg-success-subtle text-success-emphasis', negative: 'bg-danger-subtle text-danger-emphasis', neutral: 'bg-secondary-subtle text-secondary-emphasis' };
    technicalAnalysisContainer.innerHTML = `
        <div class="p-3 ${summaryColorClasses[summary.type]}">
            <h6 class="mb-1 fw-bold">종합 의견: ${summary.text}</h6>
            <p class="mb-0 small">${summary.detail}</p>
        </div>
        <ul class="list-group list-group-flush">${signalHtml}</ul>`;
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
        <li class="list-group-item d-flex justify-content-between align-items-center small py-1">ROE: <span>${rawStats.roe ? (rawStats.roe * 100).toFixed(2) + '%' : 'N/A'}</span></li>`;
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
            scales: { r: { suggestedMin: 0, suggestedMax: 100, pointLabels: { font: { size: 12 } }, ticks: { display: false } } },
            plugins: { legend: { display: false } }
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
    
    const period = periodSelect.value;
    const interval = intervalSelect.value;

    // yfinance 제한사항에 맞는 기간-간격 조합 검증
    const periodIntervalLimits = {
        '1m': ['1d', '5d', '1mo'],
        '5m': ['1d', '5d', '1mo'],
        '1h': ['1d', '5d', '1mo', '3mo'],
        '1d': ['1d', '5d', '1mo', '3mo', '1y', 'max'],
        '1wk': ['1mo', '3mo', '1y', 'max']
    };

    let errorMessage = '';
    if (periodIntervalLimits[interval]) {
        const allowedPeriods = periodIntervalLimits[interval];
        if (!allowedPeriods.includes(period)) {
            const intervalNames = {
                '1m': '1분봉', '5m': '5분봉', '1h': '1시간봉', 
                '1d': '일봉', '1wk': '주봉'
            };
            const periodNames = {
                '1d': '1일', '5d': '1주', '1mo': '1개월', '3mo': '3개월',
                '6mo': '6개월', '1y': '1년', '2y': '2년', '5y': '5년',
                '10y': '10년', 'ytd': '올해', 'max': '전체'
            };
            const allowedPeriodNames = allowedPeriods.map(p => periodNames[p] || p).join(', ');
            errorMessage = `${intervalNames[interval] || interval}은 ${allowedPeriodNames} 기간에서만 사용 가능합니다.`;
        }
    }

    if (errorMessage) {
        technicalAnalysisCard.classList.remove('d-none');
        showUserFriendlyError({ 
            message: '잘못된 기간-간격 조합', 
            details: errorMessage,
            code: 'INVALID_COMBINATION'
        });
        if (chart) chart.destroy();
        showLoading(false);
        return;
    }
    
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
        try {
            const errorData = JSON.parse(error.message);
            showUserFriendlyError(errorData);
        } catch {
            showUserFriendlyError({ message: error.message || '알 수 없는 오류가 발생했습니다' });
        }
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

// --- 모바일 터치 지원 함수 ---
function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function addTouchSupport() {
    if (isTouchDevice()) {
        // 터치 디바이스에서는 hover 클래스 제거
        document.body.classList.add('touch-device');
        
        // iOS Safari에서 100vh 이슈 해결
        const setVhProperty = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setVhProperty();
        window.addEventListener('resize', setVhProperty);
        window.addEventListener('orientationchange', () => {
            setTimeout(setVhProperty, 100);
        });
    }
}

// --- 키보드 지원 개선 ---
function addKeyboardSupport() {
    // Enter 키로 분석 실행
    tickerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAnalysis();
        }
    });
    
    // ESC 키로 자동완성 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            autocompleteResults.style.display = 'none';
        }
    });
}

// --- 에러 표시 개선 ---
function showUserFriendlyError(error, container = technicalAnalysisContainer) {
    let errorMessage = '알 수 없는 오류가 발생했습니다.';
    let errorDetail = '잠시 후 다시 시도해주세요.';
    
    if (error.code) {
        switch (error.code) {
            case 'TICKER_NOT_FOUND':
                errorMessage = '종목을 찾을 수 없습니다';
                errorDetail = '종목 심볼을 확인해주세요';
                break;
            case 'NO_DATA':
                errorMessage = '데이터가 없습니다';
                errorDetail = '다른 기간이나 간격을 선택해보세요';
                break;
            case 'CONNECTION_ERROR':
                errorMessage = '네트워크 연결 오류';
                errorDetail = '인터넷 연결을 확인해주세요';
                break;
            case 'INVALID_INPUT':
                errorMessage = '잘못된 입력값';
                errorDetail = error.details || '올바른 값을 입력해주세요';
                break;
        }
    } else if (error.message) {
        errorMessage = error.message;
    }
    
    container.innerHTML = `
        <div class="alert alert-danger small p-3 m-0">
            <div class="d-flex align-items-center mb-2">
                <i class="bi bi-exclamation-triangle-fill me-2"></i>
                <strong>${errorMessage}</strong>
            </div>
            <div class="text-muted">${errorDetail}</div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', async () => {
    // 터치 및 키보드 지원 추가
    addTouchSupport();
    addKeyboardSupport();
    
    applyTheme(localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    
    // 주식 목록 로드 (에러 처리 개선)
    try {
        const [krxRes, nasdaqRes] = await Promise.all([
            fetch('krx_stock_list.csv'),
            fetch('nasdaq_stock_list.csv')
        ]);
        
        if (!krxRes.ok || !nasdaqRes.ok) {
            throw new Error('주식 목록을 불러올 수 없습니다');
        }
        
        const [krxText, nasdaqText] = await Promise.all([krxRes.text(), nasdaqRes.text()]);
        const krxData = Papa.parse(krxText, { header: true, skipEmptyLines: true }).data.map(s => ({ Symbol: s.Symbol, Name: s.Name }));
        const nasdaqData = Papa.parse(nasdaqText, { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase() === 'symbol' ? 'Symbol' : 'Name' }).data.map(s => ({ Symbol: s.Symbol, Name: s.Name }));
        stockList = [...krxData, ...nasdaqData].filter(s => s.Symbol && s.Name);
        
        console.log(`${stockList.length}개 종목 로드 완료`);
    } catch (e) { 
        console.error("주식 목록 로드 실패:", e);
        // 주식 목록 로드 실패시에도 앱은 계속 작동
    }
    
    document.getElementById('analyze').addEventListener('click', handleAnalysis);
    chartTypeSwitch.addEventListener('change', () => { chartState.isCandlestick = chartTypeSwitch.checked; updateChart(); });
    darkModeSwitch.addEventListener('change', (e) => applyTheme(e.target.checked ? 'dark' : 'light'));
    
    // 간격 변경시 기간 옵션 동적 업데이트
    intervalSelect.addEventListener('change', updatePeriodOptions);
    
    renderIndicatorControls();
    renderPopularStocks();
    renderRecentSearches();
    updatePeriodOptions(); // 초기 기간 옵션 설정
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
        recentSearchesContainer.style.display = 'none';
        if (popularStocksContainer.children.length > 0) popularStocksContainer.classList.remove('mb-2');
        return;
    }
    recentSearchesContainer.style.display = 'flex';
    if (popularStocksContainer.children.length > 0) popularStocksContainer.classList.add('mb-2');

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

function updatePeriodOptions() {
    const interval = intervalSelect.value;
    const currentPeriod = periodSelect.value;
    
    // 간격별 허용되는 기간
    const periodIntervalLimits = {
        '1m': ['1d', '5d', '1mo'],
        '5m': ['1d', '5d', '1mo'],
        '1h': ['1d', '5d', '1mo', '3mo'],
        '1d': ['1d', '5d', '1mo', '3mo', '1y', 'max'],
        '1wk': ['1mo', '3mo', '1y', 'max']
    };
    
    // 모든 기간 옵션
    const allPeriods = [
        { value: '1d', text: '1일' },
        { value: '5d', text: '1주' },
        { value: '1mo', text: '1개월' },
        { value: '3mo', text: '3개월' },
        { value: '1y', text: '1년' },
        { value: 'max', text: '전체' }
    ];
    
    // 현재 간격에 허용되는 기간만 필터링
    const allowedPeriods = periodIntervalLimits[interval] || allPeriods.map(p => p.value);
    const filteredPeriods = allPeriods.filter(p => allowedPeriods.includes(p.value));
    
    // 기간 선택 드롭다운 업데이트
    periodSelect.innerHTML = '';
    let newSelectedPeriod = allowedPeriods.includes(currentPeriod) ? currentPeriod : filteredPeriods[0]?.value || '1y';
    
    filteredPeriods.forEach(period => {
        const option = document.createElement('option');
        option.value = period.value;
        option.textContent = period.text;
        option.selected = period.value === newSelectedPeriod;
        periodSelect.appendChild(option);
    });
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
    darkModeSwitch.checked = theme === 'dark';
    if (currentChartData.timestamp) {
        updateChart();
    }
}
