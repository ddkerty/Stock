// script.js (Final Version - All Features Included)

// --- 전역 변수 ---
// 모바일 터치 인터랙션 변수
let touchStartY = 0;
let touchStartX = 0;
let isPullingToRefresh = false;
let swipeThreshold = 50;

// 모바일 디바이스 감지
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;

// 성능 최적화 변수
let lazyLoadingEnabled = true;
let chartDataCache = new Map();
let cacheTimeout = 5 * 60 * 1000; // 5분 캐시
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
    { name: '삼성전자', symbol: '005930.KS', market: 'KRX' },
    { name: 'SK하이닉스', symbol: '000660.KS', market: 'KRX' },
    { name: 'Apple', symbol: 'AAPL', market: 'S&P 500' },
    { name: 'Microsoft', symbol: 'MSFT', market: 'S&P 500' },
    { name: 'NVIDIA', symbol: 'NVDA', market: 'S&P 500' },
    { name: 'Tesla', symbol: 'TSLA', market: 'S&P 500' },
    { name: 'Amazon', symbol: 'AMZN', market: 'S&P 500' },
    { name: 'Meta', symbol: 'META', market: 'S&P 500' }
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
 * ## 신뢰도 기반 분석 엔진 ##
 * 각 지표의 신뢰도를 포함하여 분석 결과를 표시합니다.
 * @param {object} data - 서버로부터 받은 차트 및 지표 데이터 (신뢰도 정보 포함)
 */
function renderTechnicalAnalysisCard(data) {
    const signals = [];
    let summaryScore = 0;

    const lastN = (arr, n) => (arr ? arr.filter(v => v !== null).slice(-n) : []);
    const [prevClose, latestClose] = lastN(data.ohlc.close, 2);
    
    // 신뢰도 정보 추출
    const confidences = data.confidence?.indicators || {};
    const metrics = data.confidence?.metrics || {};
    const warnings = data.confidence?.warnings || [];
    
    // 동적 분석 정보 추출
    const dynamicThresholds = data.dynamic_analysis?.thresholds || {};
    const isOptimized = data.dynamic_analysis?.is_optimized || false;
    
    // 백테스팅 결과 추출
    const backtestResults = data.backtest?.results || {};
    const hasBacktestData = Object.keys(backtestResults).length > 0;
    
    // 신뢰도 배지 생성 함수
    function getConfidenceBadge(confidence) {
        if (confidence >= 85) return '<span class="badge bg-success ms-2">신뢰도 ' + confidence + '%</span>';
        if (confidence >= 70) return '<span class="badge bg-primary ms-2">신뢰도 ' + confidence + '%</span>';
        if (confidence >= 50) return '<span class="badge bg-warning ms-2">신뢰도 ' + confidence + '%</span>';
        return '<span class="badge bg-danger ms-2">신뢰도 ' + confidence + '%</span>';
    }
    
    // 신뢰도 기반 점수 가중치 적용
    function getWeightedScore(score, confidence) {
        return score * (confidence / 100);
    }
    
    // 백테스팅 배지 생성 함수
    function getBacktestBadge(indicator) {
        if (!hasBacktestData || !backtestResults[indicator]) return '';
        
        const result = backtestResults[indicator];
        if (result.total_signals === 0) return '';
        
        const accuracy = result.accuracy || 0;
        let badgeClass = 'bg-secondary';
        let icon = '📊';
        
        if (accuracy >= 70) {
            badgeClass = 'bg-success';
            icon = '✅';
        } else if (accuracy >= 55) {
            badgeClass = 'bg-primary';
            icon = '📈';
        } else if (accuracy >= 40) {
            badgeClass = 'bg-warning';
            icon = '⚠️';
        } else {
            badgeClass = 'bg-danger';
            icon = '❌';
        }
        
        return `<span class="badge ${badgeClass} ms-1" title="최근 30일 성과">${icon} 적중률 ${accuracy}%</span>`;
    }
    
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
    const vwapConfidence = confidences.vwap || 75;
    if (latestClose !== undefined && latestVwap !== undefined) {
        const baseScore = latestClose > latestVwap ? 0.5 : -0.5;
        const weightedScore = getWeightedScore(baseScore, vwapConfidence);
        const confidenceBadge = getConfidenceBadge(vwapConfidence);
        
        const backtestBadge = getBacktestBadge('vwap');
        
        if (latestClose > latestVwap) {
            signals.push({ 
                type: 'positive', 
                text: `📈 **VWAP:** 현재가 위 (단기 매수세 우위)${confidenceBadge}${backtestBadge}`, 
                score: weightedScore 
            });
        } else {
            signals.push({ 
                type: 'negative', 
                text: `📉 **VWAP:** 현재가 아래 (단기 매도세 우위)${confidenceBadge}${backtestBadge}`, 
                score: weightedScore 
            });
        }
    } else {
        signals.push({ type: 'neutral', text: '↔️ **VWAP:** 신호 없음', score: 0 });
    }

    // --- 3. 볼린저 밴드 분석 (동적 파라미터 적용) ---
    const latestUpper = lastN(data.bbands.upper, 1)[0];
    const latestLower = lastN(data.bbands.lower, 1)[0];
    const bollingerConfidence = confidences.bollinger || 75;
    const bollingerExplanation = dynamicThresholds.bollinger?.explanation || '';
    
    if (latestClose !== undefined && latestUpper !== undefined && latestLower !== undefined) {
        const confidenceBadge = getConfidenceBadge(bollingerConfidence);
        const optimizedBadge = isOptimized ? '<span class="badge bg-info ms-1">최적화</span>' : '';
        const backtestBadge = getBacktestBadge('bollinger');
        
        if (latestClose > latestUpper) {
            const weightedScore = getWeightedScore(1.5, bollingerConfidence);
            signals.push({ 
                type: 'positive', 
                text: `🚨 **볼린저밴드:** 상단 돌파 (강세 신호)${confidenceBadge}${optimizedBadge}${backtestBadge}`, 
                score: weightedScore,
                explanation: bollingerExplanation
            });
        } else if (latestClose < latestLower) {
            const weightedScore = getWeightedScore(-1.5, bollingerConfidence);
            signals.push({ 
                type: 'negative', 
                text: `📉 **볼린저밴드:** 하단 이탈 (약세 신호)${confidenceBadge}${optimizedBadge}${backtestBadge}`, 
                score: weightedScore,
                explanation: bollingerExplanation
            });
        } else {
            signals.push({ 
                type: 'neutral', 
                text: `↔️ **볼린저밴드:** 밴드 내 위치${confidenceBadge}${optimizedBadge}${backtestBadge}`, 
                score: 0,
                explanation: bollingerExplanation
            });
        }
    } else {
        signals.push({ type: 'neutral', text: '↔️ **볼린저밴드:** 신호 없음', score: 0 });
    }

    // --- 4. RSI 분석 (동적 임계값 적용) ---
    const latestRsi = lastN(data.rsi, 1)[0];
    const rsiConfidence = confidences.rsi || 75;
    
    // 동적 임계값 적용
    const rsiUpperThreshold = dynamicThresholds.rsi?.upper_threshold || 70;
    const rsiLowerThreshold = dynamicThresholds.rsi?.lower_threshold || 30;
    const rsiExplanation = dynamicThresholds.rsi?.explanation || '';
    
    if (latestRsi !== undefined) {
        const confidenceBadge = getConfidenceBadge(rsiConfidence);
        const optimizedBadge = isOptimized ? '<span class="badge bg-info ms-1">최적화</span>' : '';
        const backtestBadge = getBacktestBadge('rsi');
        
        if (latestRsi > rsiUpperThreshold) {
            const weightedScore = getWeightedScore(-1, rsiConfidence);
            signals.push({ 
                type: 'negative', 
                text: `📈 **RSI (${latestRsi.toFixed(1)}):** 과매수 영역 (${rsiUpperThreshold.toFixed(1)} 초과)${confidenceBadge}${optimizedBadge}${backtestBadge}`, 
                score: weightedScore,
                explanation: rsiExplanation
            });
        } else if (latestRsi < rsiLowerThreshold) {
            const weightedScore = getWeightedScore(1, rsiConfidence);
            signals.push({ 
                type: 'positive', 
                text: `📉 **RSI (${latestRsi.toFixed(1)}):** 과매도 영역 (${rsiLowerThreshold.toFixed(1)} 미만)${confidenceBadge}${optimizedBadge}${backtestBadge}`, 
                score: weightedScore,
                explanation: rsiExplanation
            });
        } else {
            signals.push({ 
                type: 'neutral', 
                text: `↔️ **RSI (${latestRsi.toFixed(1)}):** 중립 구간 (${rsiLowerThreshold.toFixed(1)}-${rsiUpperThreshold.toFixed(1)})${confidenceBadge}${optimizedBadge}${backtestBadge}`, 
                score: 0,
                explanation: rsiExplanation
            });
        }
    } else {
        signals.push({ type: 'neutral', text: '↔️ **RSI:** 신호 없음', score: 0 });
    }

    // --- 5. MACD 분석 (동적 파라미터 적용) ---
    const [prevMacd, latestMacd] = lastN(data.macd.line, 2);
    const [prevSignal, latestSignal] = lastN(data.macd.signal, 2);
    const macdConfidence = confidences.macd || 75;
    const macdExplanation = dynamicThresholds.macd?.explanation || '';
    
    if (latestMacd !== undefined && prevMacd !== undefined && latestSignal !== undefined && prevSignal !== undefined) {
        const wasAbove = prevMacd > prevSignal;
        const isAbove = latestMacd > latestSignal;
        const confidenceBadge = getConfidenceBadge(macdConfidence);
        const optimizedBadge = isOptimized ? '<span class="badge bg-info ms-1">최적화</span>' : '';
        const backtestBadge = getBacktestBadge('macd');
        
        if (isAbove && !wasAbove) {
            const weightedScore = getWeightedScore(2, macdConfidence);
            signals.push({ 
                type: 'positive', 
                text: `🟢 **MACD:** 골든 크로스 발생!${confidenceBadge}${optimizedBadge}${backtestBadge}`, 
                score: weightedScore,
                explanation: macdExplanation
            });
        } else if (!isAbove && wasAbove) {
            const weightedScore = getWeightedScore(-2, macdConfidence);
            signals.push({ 
                type: 'negative', 
                text: `🔴 **MACD:** 데드 크로스 발생!${confidenceBadge}${optimizedBadge}${backtestBadge}`, 
                score: weightedScore,
                explanation: macdExplanation
            });
        } else {
            signals.push({ 
                type: 'neutral', 
                text: `↔️ **MACD:** 교차 신호 없음 (${isAbove ? '상승' : '하락'} 추세 유지)${confidenceBadge}${optimizedBadge}${backtestBadge}`, 
                score: 0,
                explanation: macdExplanation
            });
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

    // --- 7. 경고 시스템 및 데이터 품질 정보 ---
    let warningHtml = '';
    if (warnings.length > 0) {
        warningHtml = '<div class="p-2 border-top"><h6 class="mb-2 text-warning"><i class="bi bi-exclamation-triangle-fill"></i> 주의사항</h6>';
        warnings.forEach(warning => {
            const alertClass = warning.type === 'error' ? 'alert-danger' : 
                             warning.type === 'warning' ? 'alert-warning' : 'alert-info';
            warningHtml += `<div class="alert ${alertClass} py-1 px-2 small mb-1">${warning.icon} ${warning.message}</div>`;
        });
        warningHtml += '</div>';
    }
    
    // 데이터 품질 정보
    let dataQualityHtml = '';
    if (metrics.data_quality_score !== undefined) {
        const qualityColor = metrics.data_quality_score >= 95 ? 'success' : 
                           metrics.data_quality_score >= 85 ? 'primary' : 
                           metrics.data_quality_score >= 70 ? 'warning' : 'danger';
        
        dataQualityHtml = `
            <div class="p-2 border-top bg-light">
                <div class="row small text-muted">
                    <div class="col-6">
                        <i class="bi bi-database-fill"></i> 데이터품질: 
                        <span class="badge bg-${qualityColor}">${metrics.data_quality_score}%</span>
                    </div>
                    <div class="col-6">
                        <i class="bi bi-bar-chart-line-fill"></i> 거래량: 
                        <span class="${metrics.volume_ratio > 1.5 ? 'text-success' : metrics.volume_ratio < 0.5 ? 'text-danger' : 'text-muted'}">
                            ${metrics.volume_ratio ? (metrics.volume_ratio * 100).toFixed(0) + '%' : 'N/A'}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }
    
    // 동적 분석 정보 HTML
    let dynamicAnalysisHtml = '';
    if (isOptimized && Object.keys(dynamicThresholds).length > 0) {
        dynamicAnalysisHtml = `
            <div class="p-2 border-top bg-info-subtle">
                <h6 class="mb-2 text-info"><i class="bi bi-gear-fill"></i> 최적화된 분석</h6>
                <div class="small text-muted">
                    <div class="row">
                        <div class="col-12 mb-1">
                            <strong>이 종목에 특화된 분석 파라미터:</strong>
                        </div>
                    </div>
                    <div class="accordion accordion-flush" id="dynamicAccordion">
                        <div class="accordion-item bg-transparent border-0">
                            <h6 class="accordion-header">
                                <button class="accordion-button collapsed bg-transparent border-0 py-1 px-0 small" type="button" data-bs-toggle="collapse" data-bs-target="#collapseDetails">
                                    <i class="bi bi-chevron-right me-1"></i> 상세 파라미터 보기
                                </button>
                            </h6>
                            <div id="collapseDetails" class="accordion-collapse collapse" data-bs-parent="#dynamicAccordion">
                                <div class="accordion-body px-0 py-1">
                                    ${dynamicThresholds.rsi ? `<div>• RSI: ${dynamicThresholds.rsi.explanation}</div>` : ''}
                                    ${dynamicThresholds.bollinger ? `<div>• 볼린저밴드: ${dynamicThresholds.bollinger.explanation}</div>` : ''}
                                    ${dynamicThresholds.macd ? `<div>• MACD: ${dynamicThresholds.macd.explanation}</div>` : ''}
                                    ${dynamicThresholds.vwap ? `<div>• VWAP: ${dynamicThresholds.vwap.explanation}</div>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // 종합 신뢰도 계산
    const validConfidences = Object.values(confidences).filter(c => c > 0);
    const averageConfidence = validConfidences.length > 0 ? 
        Math.round(validConfidences.reduce((a, b) => a + b, 0) / validConfidences.length) : 75;
    const overallConfidenceBadge = getConfidenceBadge(averageConfidence);

    // 리스크 지표 HTML 생성 (모바일 최적화)
    let riskMetricsHtml = '';
    if (data.risk_metrics) {
        const metrics = data.risk_metrics;
        riskMetricsHtml = `
        <div class="card mt-3">
            <div class="card-header py-2">
                <h6 class="mb-0 fw-bold">📊 리스크 지표</h6>
                ${isMobile ? '<div class="swipe-indicator">← 스와이프 →</div>' : ''}
            </div>
            <div class="card-body py-2">
                <div class="row text-center ${isMobile ? 'risk-metrics-mobile' : ''}">
                    <div class="col-4">
                        <div class="small text-muted">최대손실폭(MDD)</div>
                        <div class="fw-bold ${metrics.mdd && metrics.mdd < -20 ? 'text-danger' : metrics.mdd && metrics.mdd < -10 ? 'text-warning' : 'text-success'}">
                            ${metrics.mdd !== null ? metrics.mdd.toFixed(1) + '%' : 'N/A'}
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="small text-muted">샤프비율</div>
                        <div class="fw-bold ${metrics.sharpe_ratio && metrics.sharpe_ratio > 1 ? 'text-success' : metrics.sharpe_ratio && metrics.sharpe_ratio > 0 ? 'text-warning' : 'text-danger'}">
                            ${metrics.sharpe_ratio !== null ? metrics.sharpe_ratio.toFixed(2) : 'N/A'}
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="small text-muted">베타 (vs KOSPI)</div>
                        <div class="fw-bold ${metrics.beta && Math.abs(metrics.beta - 1) < 0.2 ? 'text-success' : 'text-info'}">
                            ${metrics.beta !== null ? metrics.beta.toFixed(2) : 'N/A'}
                        </div>
                    </div>
                </div>
                <div class="row text-center mt-2 ${isMobile ? 'risk-metrics-mobile' : ''}">
                    <div class="col-4">
                        <div class="small text-muted">변동성 (연율화)</div>
                        <div class="fw-bold ${metrics.volatility && metrics.volatility > 30 ? 'text-danger' : metrics.volatility && metrics.volatility > 20 ? 'text-warning' : 'text-success'}">
                            ${metrics.volatility !== null ? metrics.volatility.toFixed(1) + '%' : 'N/A'}
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="small text-muted">승률</div>
                        <div class="fw-bold ${metrics.win_rate && metrics.win_rate > 60 ? 'text-success' : metrics.win_rate && metrics.win_rate > 45 ? 'text-warning' : 'text-danger'}">
                            ${metrics.win_rate !== null ? metrics.win_rate.toFixed(1) + '%' : 'N/A'}
                        </div>
                    </div>
                    <div class="col-4">
                        <div class="small text-muted">연간수익률</div>
                        <div class="fw-bold ${metrics.annual_return && metrics.annual_return > 10 ? 'text-success' : metrics.annual_return && metrics.annual_return > 0 ? 'text-warning' : 'text-danger'}">
                            ${metrics.annual_return !== null ? (metrics.annual_return > 0 ? '+' : '') + metrics.annual_return.toFixed(1) + '%' : 'N/A'}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // 다중 시간대 분석 HTML 생성
    let multiTimeframeHtml = '';
    if (data.multi_timeframe && data.multi_timeframe.timeframes && Object.keys(data.multi_timeframe.timeframes).length > 0) {
        const mtf = data.multi_timeframe;
        const consensusColors = {
            'bullish': 'text-success',
            'bearish': 'text-danger',
            'mixed': 'text-warning',
            'insufficient_data': 'text-muted',
            'error': 'text-muted'
        };
        const consensusText = {
            'bullish': '🔺 상승 컨센서스',
            'bearish': '🔻 하락 컨센서스',
            'mixed': '↔️ 혼재된 신호',
            'insufficient_data': '❓ 데이터 부족',
            'error': '⚠️ 분석 오류'
        };
        
        let timeframeRows = '';
        for (const [key, timeframe] of Object.entries(mtf.timeframes)) {
            const signalEmojis = {
                'bullish': '🟢',
                'bearish': '🔴',
                'neutral': '🟡'
            };
            const signalText = {
                'bullish': '상승',
                'bearish': '하락',
                'neutral': '중립'
            };
            
            timeframeRows += `
                <tr>
                    <td class="small">${timeframe.name}</td>
                    <td class="text-center">
                        ${signalEmojis[timeframe.overall] || '⚪'} 
                        <span class="${consensusColors[timeframe.overall] || 'text-muted'}">${signalText[timeframe.overall] || '불명'}</span>
                    </td>
                    <td class="small text-muted">${timeframe.data_points}개 데이터</td>
                </tr>
            `;
        }
        
        multiTimeframeHtml = `
        <div class="card mt-3">
            <div class="card-header py-2">
                <h6 class="mb-0 fw-bold">⏱️ 다중 시간대 분석</h6>
            </div>
            <div class="card-body py-2">
                <div class="row mb-2">
                    <div class="col-8">
                        <div class="fw-bold ${consensusColors[mtf.consensus] || 'text-muted'}">
                            ${consensusText[mtf.consensus] || '분석 불가'}
                        </div>
                        <div class="small text-muted">
                            ${mtf.total_timeframes}개 시간대 중 ${mtf.confidence}% 일치
                        </div>
                    </div>
                    <div class="col-4 text-end">
                        <span class="badge ${mtf.confidence >= 70 ? 'bg-success' : mtf.confidence >= 50 ? 'bg-warning' : 'bg-secondary'}">
                            신뢰도 ${mtf.confidence}%
                        </span>
                    </div>
                </div>
                <table class="table table-sm mb-0">
                    <thead>
                        <tr class="table-light">
                            <th class="small">시간대</th>
                            <th class="text-center small">종합신호</th>
                            <th class="small">데이터</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${timeframeRows}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    const summaryColorClasses = { positive: 'bg-success-subtle text-success-emphasis', negative: 'bg-danger-subtle text-danger-emphasis', neutral: 'bg-secondary-subtle text-secondary-emphasis' };
    technicalAnalysisContainer.innerHTML = `
        <div class="p-3 ${summaryColorClasses[summary.type]} ${isMobile ? 'analysis-summary' : ''}">
            <h6 class="mb-1 fw-bold">종합 의견: ${summary.text} ${overallConfidenceBadge}</h6>
            <p class="mb-0 small">${summary.detail}</p>
        </div>
        <ul class="list-group list-group-flush">${signalHtml}</ul>
        ${riskMetricsHtml}
        ${multiTimeframeHtml}
        ${warningHtml}
        ${dataQualityHtml}
        ${dynamicAnalysisHtml}`;
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
    const gradeColors = { 
        "A (매우 우수)": 'bg-success',      // 초록 (매우 좋음)
        "B (우수)": 'bg-primary',           // 파랑 (좋음)
        "C (양호)": 'bg-info',              // 하늘색 (양호)
        "D (보통)": 'bg-warning',           // 노랑 (보통)
        "E (주의)": 'bg-danger',            // 빨강 (주의)
        "F (위험)": 'bg-dark'               // 검정 (위험)
    };
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
    
    // 캐시 확인
    const cacheKey = getCacheKey(ticker, period, interval);
    const cachedData = getCachedData(cacheKey);
    
    if (cachedData) {
        // 캐시된 데이터 사용
        const compressedData = compressChartData(cachedData.chartData);
        currentChartData = compressedData;
        updateChart();
        renderTechnicalAnalysisCard(compressedData);
        renderStockInfo(cachedData.infoData);
        renderFundamentalStats(cachedData.infoData);
        updateStickyHeader(ticker);
        saveRecentSearch(ticker);
        showLoading(false);
        return;
    }

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

        // 데이터 압축 및 캐시 저장
        const compressedData = compressChartData(chartData);
        setCachedData(cacheKey, {
            chartData: chartData,
            infoData: infoData
        });
        
        currentChartData = compressedData;
        updateChart();
        renderTechnicalAnalysisCard(compressedData);
        renderStockInfo(infoData);
        renderFundamentalStats(infoData);
        
        // 모바일 스티키 헤더 업데이트
        updateStickyHeader(ticker);
        
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

// --- 모바일 터치 제스처 핸들러 ---
function initMobileTouchHandlers() {
    if (!isMobile) return;
    
    // 풀투리프레시 구현
    let pullToRefreshElement = null;
    
    document.addEventListener('touchstart', function(e) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        
        // 맨 위에서 아래로 당길 때만 풀투리프레시 활성화
        if (window.scrollY === 0) {
            isPullingToRefresh = true;
        }
    });
    
    document.addEventListener('touchmove', function(e) {
        if (!isPullingToRefresh) return;
        
        const touchY = e.touches[0].clientY;
        const deltaY = touchY - touchStartY;
        
        if (deltaY > 60 && window.scrollY === 0) {
            if (!pullToRefreshElement) {
                pullToRefreshElement = document.createElement('div');
                pullToRefreshElement.className = 'pull-to-refresh active';
                pullToRefreshElement.innerHTML = '↓ 새로고침하려면 놓으세요';
                document.body.insertBefore(pullToRefreshElement, document.body.firstChild);
            }
        } else if (pullToRefreshElement) {
            pullToRefreshElement.remove();
            pullToRefreshElement = null;
        }
    });
    
    document.addEventListener('touchend', function(e) {
        if (pullToRefreshElement) {
            // 현재 검색어로 새로고침
            const ticker = tickerInput.value.trim();
            if (ticker) {
                handleAnalysis();
            }
            pullToRefreshElement.remove();
            pullToRefreshElement = null;
        }
        isPullingToRefresh = false;
    });
    
    // 카드 스와이프 제스처 (좌우 스와이프로 차트 타입 변경)
    const chartContainer = document.getElementById('chart-container');
    if (chartContainer) {
        chartContainer.addEventListener('touchend', function(e) {
            const touchEndX = e.changedTouches[0].clientX;
            const deltaX = touchEndX - touchStartX;
            
            if (Math.abs(deltaX) > swipeThreshold) {
                if (deltaX > 0) {
                    // 오른쪽 스와이프 - 캔들차트로 전환
                    if (!chartState.isCandlestick) {
                        const candlestickToggle = document.getElementById('candlestick-toggle');
                        if (candlestickToggle) {
                            candlestickToggle.checked = true;
                            toggleCandlestick();
                        }
                    }
                } else {
                    // 왼쪽 스와이프 - 라인차트로 전환
                    if (chartState.isCandlestick) {
                        const candlestickToggle = document.getElementById('candlestick-toggle');
                        if (candlestickToggle) {
                            candlestickToggle.checked = false;
                            toggleCandlestick();
                        }
                    }
                }
            }
        });
    }
}

// 터치 피드백 효과 추가
function addTouchRippleEffect() {
    if (!isMobile) return;
    
    const buttons = document.querySelectorAll('.btn, .list-group-item');
    buttons.forEach(button => {
        button.classList.add('touch-ripple');
    });
}

// 모바일 네비게이션 함수들
let fabMenuOpen = false;

function toggleFabMenu() {
    const fabMenu = document.getElementById('fab-menu');
    const fab = document.getElementById('fab');
    
    fabMenuOpen = !fabMenuOpen;
    
    if (fabMenuOpen) {
        fabMenu.classList.add('show');
        fab.innerHTML = '<i class="bi bi-x"></i>';
    } else {
        fabMenu.classList.remove('show');
        fab.innerHTML = '<i class="bi bi-plus"></i>';
    }
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (fabMenuOpen) toggleFabMenu();
}

function scrollToAnalysis() {
    const analysisElement = document.getElementById('technical-analysis-card');
    if (analysisElement && !analysisElement.classList.contains('d-none')) {
        analysisElement.scrollIntoView({ behavior: 'smooth' });
    }
}

function refreshCurrentAnalysis() {
    const ticker = tickerInput.value.trim();
    if (ticker) {
        handleAnalysis();
    }
    if (fabMenuOpen) toggleFabMenu();
}

function shareAnalysis() {
    const ticker = tickerInput.value.trim();
    if (ticker && navigator.share) {
        navigator.share({
            title: `Stock Insight - ${ticker} 분석`,
            text: `${ticker} 주식 분석 결과를 보세요!`,
            url: window.location.href
        });
    } else if (ticker) {
        // 폴백: 클립보드에 복사
        navigator.clipboard.writeText(window.location.href);
        alert('링크가 클립보드에 복사되었습니다!');
    }
    if (fabMenuOpen) toggleFabMenu();
}

function togglePeriod() {
    const periodSelect = document.getElementById('period-select');
    const currentIndex = periodSelect.selectedIndex;
    const nextIndex = (currentIndex + 1) % periodSelect.options.length;
    periodSelect.selectedIndex = nextIndex;
    
    if (tickerInput.value.trim()) {
        handleAnalysis();
    }
}

function toggleChartType() {
    const candlestickToggle = document.getElementById('candlestick-toggle');
    if (candlestickToggle) {
        candlestickToggle.checked = !candlestickToggle.checked;
        toggleCandlestick();
    }
}

// 스티키 헤더 표시/숨김
function updateStickyHeader(ticker) {
    if (!isMobile) return;
    
    const stickyHeader = document.getElementById('mobile-sticky-header');
    const stickyTickerName = document.getElementById('sticky-ticker-name');
    
    if (ticker && stickyHeader && stickyTickerName) {
        stickyTickerName.textContent = ticker;
        stickyHeader.classList.remove('d-none');
    }
}

// FAB 표시/숨김 (스크롤 기반)
function updateFabVisibility() {
    if (!isMobile) return;
    
    const fab = document.getElementById('fab');
    const scrollY = window.scrollY;
    
    if (scrollY > 300) {
        fab?.classList.add('show');
        fab?.classList.remove('d-none');
    } else {
        fab?.classList.remove('show');
        if (!fabMenuOpen) {
            setTimeout(() => fab?.classList.add('d-none'), 300);
        }
    }
}

// 성능 최적화 함수들
function getCacheKey(ticker, period, interval) {
    return `${ticker}_${period}_${interval}`;
}

function getCachedData(cacheKey) {
    const cached = chartDataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < cacheTimeout) {
        return cached.data;
    }
    return null;
}

function setCachedData(cacheKey, data) {
    chartDataCache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
    });
    
    // 캐시 크기 제한 (최대 50개 항목)
    if (chartDataCache.size > 50) {
        const firstKey = chartDataCache.keys().next().value;
        chartDataCache.delete(firstKey);
    }
}

// 데이터 압축 (중복 제거 및 정밀도 조정)
function compressChartData(data) {
    if (!data || !data.timestamp) return data;
    
    // 모바일에서는 데이터 포인트 수를 줄여서 성능 향상
    if (isMobile && data.timestamp.length > 200) {
        const step = Math.ceil(data.timestamp.length / 200);
        const compressed = {
            timestamp: [],
            ohlc: { open: [], high: [], low: [], close: [], volume: [] },
            rsi: [],
            macd: { line: [], signal: [], histogram: [] },
            bbands: { upper: [], middle: [], lower: [] },
            vwap: []
        };
        
        for (let i = 0; i < data.timestamp.length; i += step) {
            compressed.timestamp.push(data.timestamp[i]);
            compressed.ohlc.open.push(data.ohlc.open[i]);
            compressed.ohlc.high.push(data.ohlc.high[i]);
            compressed.ohlc.low.push(data.ohlc.low[i]);
            compressed.ohlc.close.push(data.ohlc.close[i]);
            compressed.ohlc.volume.push(data.ohlc.volume[i]);
            compressed.rsi.push(data.rsi[i]);
            compressed.macd.line.push(data.macd.line[i]);
            compressed.macd.signal.push(data.macd.signal[i]);
            compressed.macd.histogram.push(data.macd.histogram[i]);
            compressed.bbands.upper.push(data.bbands.upper[i]);
            compressed.bbands.middle.push(data.bbands.middle[i]);
            compressed.bbands.lower.push(data.bbands.lower[i]);
            compressed.vwap.push(data.vwap[i]);
        }
        
        // 메타데이터 보존
        compressed.metadata = data.metadata;
        compressed.confidence = data.confidence;
        compressed.dynamic_analysis = data.dynamic_analysis;
        compressed.risk_metrics = data.risk_metrics;
        compressed.multi_timeframe = data.multi_timeframe;
        compressed.backtest = data.backtest;
        
        return compressed;
    }
    
    return data;
}

// 레이지 로딩 구현
function createLazyImageObserver() {
    if (!lazyLoadingEnabled || !('IntersectionObserver' in window)) return;
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                observer.unobserve(img);
            }
        });
    });
    
    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// 디바운스 유틸리티 (검색 최적화)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    // 모바일 터치 핸들러 초기화
    initMobileTouchHandlers();
    addTouchRippleEffect();
    
    // 스크롤 이벤트 리스너 (FAB 표시/숨김)
    if (isMobile) {
        window.addEventListener('scroll', updateFabVisibility);
    }
    
    // 성능 최적화 초기화
    createLazyImageObserver();
    
    // 터치 및 키보드 지원 추가
    addTouchSupport();
    addKeyboardSupport();
    
    applyTheme(localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    
    // 주식 목록 로드 (KRX, NASDAQ, S&P 500)
    try {
        const [krxRes, nasdaqRes, sp500Res] = await Promise.all([
            fetch('krx_stock_list.csv'),
            fetch('nasdaq_stock_list.csv'),
            fetch('sp500_stock_list.csv').catch(() => null) // S&P 500은 선택적
        ]);
        
        if (!krxRes.ok || !nasdaqRes.ok) {
            throw new Error('필수 주식 목록을 불러올 수 없습니다');
        }
        
        const fetchPromises = [krxRes.text(), nasdaqRes.text()];
        if (sp500Res && sp500Res.ok) {
            fetchPromises.push(sp500Res.text());
        }
        
        const textResults = await Promise.all(fetchPromises);
        const [krxText, nasdaqText, sp500Text] = textResults;
        
        // KRX 데이터 파싱
        const krxData = Papa.parse(krxText, { header: true, skipEmptyLines: true })
            .data.map(s => ({ 
                Symbol: s.Symbol, 
                Name: s.Name,
                Market: s.Market || 'KRX'
            }));
        
        // NASDAQ 데이터 파싱
        const nasdaqData = Papa.parse(nasdaqText, { header: true, skipEmptyLines: true })
            .data.map(s => ({ 
                Symbol: s.Symbol, 
                Name: s['Company Name'] || s.Name,
                Market: 'NASDAQ'
            }));
        
        let allData = [...krxData, ...nasdaqData];
        
        // S&P 500 데이터 파싱 (있는 경우)
        if (sp500Text) {
            const sp500Data = Papa.parse(sp500Text, { header: true, skipEmptyLines: true })
                .data.map(s => ({ 
                    Symbol: s.Symbol, 
                    Name: s['Company Name'] || s.Name,
                    Market: 'S&P 500',
                    Sector: s.Sector
                }));
            allData = [...allData, ...sp500Data];
        }
        
        // 중복 제거 및 필터링
        const uniqueStocks = new Map();
        allData.forEach(stock => {
            if (stock.Symbol && stock.Name) {
                // 같은 심볼이 있으면 S&P 500 > NASDAQ > KRX 순으로 우선순위
                const existing = uniqueStocks.get(stock.Symbol);
                if (!existing || 
                    (stock.Market === 'S&P 500') || 
                    (stock.Market === 'NASDAQ' && existing.Market === 'KRX')) {
                    uniqueStocks.set(stock.Symbol, stock);
                }
            }
        });
        
        stockList = Array.from(uniqueStocks.values());
        
        console.log(`${stockList.length}개 종목 로드 완료 (KRX: ${krxData.length}, NASDAQ: ${nasdaqData.length}${sp500Text ? `, S&P 500: ${Papa.parse(sp500Text, { header: true, skipEmptyLines: true }).data.length}` : ''})`);
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
            const marketBadge = stock.Market ? `<span class="badge bg-secondary me-1">${stock.Market}</span>` : '';
            item.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <span class="stock-name">${stock.Name}</span>
                        <div class="small text-muted">${marketBadge}${stock.Symbol}</div>
                    </div>
                </div>
            `;
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
