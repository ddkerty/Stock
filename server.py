# server.py (환경변수 설정 및 보안 강화 버전)

import logging
import os
import numpy as np
import pandas as pd
import yfinance as yf
from flask import Flask, jsonify, request, send_from_directory, make_response
from flask_cors import CORS
from flask_caching import Cache
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from config import get_config

# --- Flask 앱 및 설정 ---
def create_app():
    app = Flask(__name__, static_folder='.', static_url_path='')
    
    # 환경별 설정 로드
    config_class = get_config()
    app.config.from_object(config_class)
    
    # CORS 설정
    CORS(app, origins=app.config['CORS_ORIGINS'])
    
    # Rate Limiting 설정
    limiter = Limiter(
        key_func=get_remote_address,
        app=app,
        default_limits=["200 per hour", "50 per minute"],
        storage_uri="memory://"
    )
    
    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO if not app.config['DEBUG'] else logging.DEBUG,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 캐시 설정
    cache = Cache()
    cache.init_app(app)
    
    # 보안 헤더 설정
    @app.after_request
    def add_security_headers(response):
        # XSS 보호
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        
        # HTTPS 강제 (운영환경에서만)
        if not app.config['DEBUG']:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        
        # Content Security Policy
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' cdn.jsdelivr.net cdnjs.cloudflare.com; "
            "style-src 'self' 'unsafe-inline' cdn.jsdelivr.net; "
            "img-src 'self' data:; "
            "font-src 'self' cdn.jsdelivr.net; "
            "connect-src 'self';"
        )
        
        return response
    
    return app, limiter, cache

app, limiter, cache = create_app()


# --- 웹 페이지 및 정적 파일 라우팅 ---
@app.route('/')
def serve_index():
    """index.html 파일을 서비스합니다."""
    return send_from_directory('.', 'index.html')


# --- 직접 만드는 기술적 분석 함수들 ---
def calculate_bbands(close, length=20, std=2):
    middle_band = close.rolling(window=length).mean()
    std_dev = close.rolling(window=length).std()
    upper_band = middle_band + (std_dev * std)
    lower_band = middle_band - (std_dev * std)
    return upper_band, middle_band, lower_band

def calculate_rsi(close, length=14):
    delta = close.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=length).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=length).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def calculate_macd(close, fast=12, slow=26, signal=9):
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram

def calculate_vwap(high, low, close, volume, period=None):
    typical_price = (high + low + close) / 3
    if period:
        # 기간 제한 VWAP
        return (typical_price * volume).rolling(window=period).sum() / volume.rolling(window=period).sum()
    else:
        # 누적 VWAP (기존 방식)
        return (typical_price * volume).cumsum() / volume.cumsum()

def calculate_confidence_metrics(data):
    """신뢰도 계산을 위한 메트릭스"""
    try:
        # 거래량 분석
        recent_volume = data['Volume'].tail(5).mean()  # 최근 5일 평균
        historical_volume = data['Volume'].tail(30).mean()  # 30일 평균
        volume_ratio = recent_volume / historical_volume if historical_volume > 0 else 1
        
        # 변동성 분석
        recent_volatility = data['Close'].pct_change().tail(10).std()  # 최근 10일 변동성
        historical_volatility = data['Close'].pct_change().tail(60).std()  # 60일 변동성
        volatility_ratio = recent_volatility / historical_volatility if historical_volatility > 0 else 1
        
        # 데이터 품질
        total_points = len(data)
        valid_points = data['Close'].notna().sum()
        data_completeness = valid_points / total_points if total_points > 0 else 0
        
        return {
            'volume_ratio': volume_ratio,
            'volatility_ratio': volatility_ratio,
            'data_completeness': data_completeness,
            'data_points': total_points,
            'recent_volume': recent_volume,
            'historical_volume': historical_volume
        }
    except Exception as e:
        logging.warning(f"Error calculating confidence metrics: {e}")
        return {
            'volume_ratio': 1.0,
            'volatility_ratio': 1.0,
            'data_completeness': 0.8,
            'data_points': len(data) if hasattr(data, '__len__') else 0
        }

def calculate_indicator_confidence(indicator_name, value, metrics, additional_data=None):
    """각 지표별 신뢰도 계산 (0-100)"""
    base_confidence = 85  # 기본 신뢰도
    
    # 공통 신뢰도 요소
    confidence = base_confidence
    
    # 거래량 기반 조정
    if metrics['volume_ratio'] < 0.3:  # 거래량이 평소의 30% 미만
        confidence -= 25
    elif metrics['volume_ratio'] < 0.7:  # 거래량이 평소의 70% 미만
        confidence -= 10
    elif metrics['volume_ratio'] > 3.0:  # 거래량이 평소의 3배 초과
        confidence -= 5  # 과도한 거래량도 약간 신뢰도 하락
    
    # 변동성 기반 조정
    if metrics['volatility_ratio'] > 2.5:  # 변동성이 평소의 2.5배 초과
        confidence -= 20
    elif metrics['volatility_ratio'] > 1.8:  # 변동성이 평소의 1.8배 초과
        confidence -= 10
    
    # 데이터 품질 기반 조정
    if metrics['data_completeness'] < 0.8:  # 데이터 완성도 80% 미만
        confidence -= 15
    elif metrics['data_completeness'] < 0.9:  # 데이터 완성도 90% 미만
        confidence -= 5
    
    # 지표별 특수 조정
    if indicator_name == 'VWAP':
        # VWAP은 거래량이 중요
        if metrics['volume_ratio'] > 1.5:  # 충분한 거래량
            confidence += 5
        elif metrics['volume_ratio'] < 0.5:  # 거래량 부족
            confidence -= 10
            
    elif indicator_name == 'RSI':
        # RSI는 충분한 데이터 포인트가 중요
        if metrics['data_points'] < 20:  # 20일 미만 데이터
            confidence -= 20
        elif metrics['data_points'] < 14:  # 14일 미만 데이터
            confidence -= 30
            
    elif indicator_name == 'MACD':
        # MACD는 추세 지표이므로 변동성에 더 민감
        if metrics['volatility_ratio'] > 2.0:
            confidence -= 15
        if metrics['data_points'] < 26:  # MACD 계산에 필요한 최소 데이터
            confidence -= 25
    
    elif indicator_name == 'Bollinger':
        # 볼린저밴드는 변동성 지표이므로 극단적 변동성에서 오히려 유효
        if 1.2 < metrics['volatility_ratio'] < 2.0:  # 적당한 변동성 증가
            confidence += 5
    
    # 최종 신뢰도는 30-100 범위로 제한
    return max(30, min(100, int(confidence)))

def generate_warnings(metrics, data):
    """경고 메시지 생성"""
    warnings = []
    
    # 거래량 관련 경고
    if metrics['volume_ratio'] < 0.3:
        warnings.append({
            'type': 'warning',
            'icon': '⚠️',
            'message': f"거래량이 평소의 {int(metrics['volume_ratio']*100)}% 수준으로 신호 신뢰도가 낮습니다"
        })
    elif metrics['volume_ratio'] > 4.0:
        warnings.append({
            'type': 'info',
            'icon': '📈',
            'message': f"거래량이 평소의 {int(metrics['volume_ratio']*100)}% 수준으로 급증했습니다"
        })
    
    # 변동성 관련 경고
    if metrics['volatility_ratio'] > 2.5:
        warnings.append({
            'type': 'warning',
            'icon': '🌪️',
            'message': f"변동성이 평소의 {metrics['volatility_ratio']:.1f}배로 높아 단기 변동 가능성이 큽니다"
        })
    elif metrics['volatility_ratio'] < 0.3:
        warnings.append({
            'type': 'info',
            'icon': '😴',
            'message': "변동성이 매우 낮아 횡보 상태일 가능성이 높습니다"
        })
    
    # 데이터 품질 관련 경고
    if metrics['data_completeness'] < 0.9:
        warnings.append({
            'type': 'error',
            'icon': '🔧',
            'message': f"데이터 완성도 {int(metrics['data_completeness']*100)}% - 일부 지표의 정확도가 떨어질 수 있습니다"
        })
    
    # 데이터 수량 관련 경고
    if metrics['data_points'] < 30:
        warnings.append({
            'type': 'warning',
            'icon': '📊',
            'message': f"분석 기간이 {metrics['data_points']}일로 짧아 장기 추세 분석에 한계가 있습니다"
        })
    
    # 시장 시간 관련 경고 (추가 가능)
    import datetime
    now = datetime.datetime.now()
    if now.weekday() >= 5:  # 주말
        warnings.append({
            'type': 'info',
            'icon': '📅',
            'message': "주말 데이터 - 시장 개장 시 가격 변동 가능성이 있습니다"
        })
    
    return warnings

def calculate_dynamic_thresholds(data):
    """종목별 동적 임계값 계산"""
    try:
        # RSI 동적 임계값 (최근 90일 기준)
        rsi_values = calculate_rsi(data['Close']).dropna()
        if len(rsi_values) >= 30:
            rsi_upper = np.percentile(rsi_values.tail(90), 80)  # 상위 20%
            rsi_lower = np.percentile(rsi_values.tail(90), 20)  # 하위 20%
            # 극단값 방지 (최소 5포인트 차이 유지)
            rsi_upper = max(rsi_upper, 65)
            rsi_lower = min(rsi_lower, 35)
        else:
            rsi_upper, rsi_lower = 70, 30  # 기본값

        # 볼린저밴드 동적 기간 (변동성에 따라 조정)
        volatility = data['Close'].pct_change().tail(30).std()
        if volatility > 0.03:  # 높은 변동성
            bb_period = 15  # 짧은 기간
            bb_std = 2.2    # 넓은 밴드
        elif volatility < 0.015:  # 낮은 변동성
            bb_period = 25  # 긴 기간
            bb_std = 1.8    # 좁은 밴드
        else:
            bb_period = 20  # 표준
            bb_std = 2.0

        # MACD 동적 파라미터 (추세 강도에 따라)
        close_prices = data['Close'].tail(60)
        if len(close_prices) >= 30:
            # 추세 강도 계산 (선형 회귀 기울기)
            x = np.arange(len(close_prices))
            slope = np.polyfit(x, close_prices, 1)[0]
            trend_strength = abs(slope) / close_prices.mean()
            
            if trend_strength > 0.001:  # 강한 추세
                macd_fast, macd_slow, macd_signal = 8, 21, 7   # 빠른 반응
            else:  # 약한 추세/횡보
                macd_fast, macd_slow, macd_signal = 12, 26, 9  # 표준
        else:
            macd_fast, macd_slow, macd_signal = 12, 26, 9

        # VWAP 신뢰도 기간 (거래량 패턴에 따라)
        volume_cv = data['Volume'].tail(30).std() / data['Volume'].tail(30).mean()
        if volume_cv > 1.0:  # 불규칙한 거래량
            vwap_period = 10  # 짧은 기간
        else:
            vwap_period = 20  # 표준 기간

        return {
            'rsi': {
                'upper_threshold': float(rsi_upper),
                'lower_threshold': float(rsi_lower),
                'explanation': f"과거 90일 기준 상위 20%({rsi_upper:.1f})/하위 20%({rsi_lower:.1f}) 수준"
            },
            'bollinger': {
                'period': int(bb_period),
                'std_dev': float(bb_std),
                'explanation': f"변동성 조정: {bb_period}일 기간, {bb_std}σ 밴드"
            },
            'macd': {
                'fast': int(macd_fast),
                'slow': int(macd_slow),
                'signal': int(macd_signal),
                'explanation': f"추세 강도 조정: {macd_fast}-{macd_slow}-{macd_signal} 조합"
            },
            'vwap': {
                'period': int(vwap_period),
                'explanation': f"거래량 패턴 조정: {vwap_period}일 기준"
            }
        }
    except Exception as e:
        logging.warning(f"Error calculating dynamic thresholds: {e}")
        return {
            'rsi': {'upper_threshold': 70, 'lower_threshold': 30, 'explanation': '표준 임계값 (70/30)'},
            'bollinger': {'period': 20, 'std_dev': 2.0, 'explanation': '표준 설정 (20일, 2σ)'},
            'macd': {'fast': 12, 'slow': 26, 'signal': 9, 'explanation': '표준 설정 (12-26-9)'},
            'vwap': {'period': 20, 'explanation': '표준 기간 (20일)'}
        }

def analyze_multiple_timeframes(ticker, base_period='1y'):
    """
    다중 시간대 분석 - 단기, 중기, 장기 신호 일치도 확인
    """
    try:
        timeframes = {
            'short': {'period': '1mo', 'interval': '1d', 'name': '단기 (1개월)'},
            'medium': {'period': '3mo', 'interval': '1d', 'name': '중기 (3개월)'},
            'long': {'period': '1y', 'interval': '1wk', 'name': '장기 (1년)'}
        }
        
        results = {}
        stock = yf.Ticker(ticker)
        
        for timeframe_key, config in timeframes.items():
            try:
                data = stock.history(period=config['period'], interval=config['interval'], timeout=5)
                if data.empty or len(data) < 10:
                    continue
                    
                # 각 시간대별 신호 계산
                rsi = calculate_rsi(data['Close'])
                macd_line, macd_signal, macd_hist = calculate_macd(data['Close'])
                bbu, bbm, bbl = calculate_bbands(data['Close'])
                
                if len(rsi) == 0 or len(macd_line) == 0 or len(bbu) == 0:
                    continue
                
                # 최신 값들
                latest_rsi = rsi.iloc[-1] if len(rsi) > 0 else None
                latest_macd = macd_line.iloc[-1] - macd_signal.iloc[-1] if len(macd_line) > 0 else None
                latest_close = data['Close'].iloc[-1]
                latest_bb_upper = bbu.iloc[-1] if len(bbu) > 0 else None
                latest_bb_lower = bbl.iloc[-1] if len(bbl) > 0 else None
                
                # 신호 판정
                signals = {}
                
                # RSI 신호
                if latest_rsi is not None:
                    if latest_rsi > 70:
                        signals['rsi'] = 'bearish'
                    elif latest_rsi < 30:
                        signals['rsi'] = 'bullish'
                    else:
                        signals['rsi'] = 'neutral'
                
                # MACD 신호
                if latest_macd is not None:
                    if latest_macd > 0:
                        signals['macd'] = 'bullish'
                    elif latest_macd < 0:
                        signals['macd'] = 'bearish'
                    else:
                        signals['macd'] = 'neutral'
                
                # 볼린저밴드 신호
                if latest_bb_upper is not None and latest_bb_lower is not None:
                    if latest_close > latest_bb_upper:
                        signals['bollinger'] = 'bearish'
                    elif latest_close < latest_bb_lower:
                        signals['bollinger'] = 'bullish'
                    else:
                        signals['bollinger'] = 'neutral'
                
                # 종합 신호
                bullish_count = sum(1 for signal in signals.values() if signal == 'bullish')
                bearish_count = sum(1 for signal in signals.values() if signal == 'bearish')
                
                if bullish_count >= 2:
                    overall_signal = 'bullish'
                elif bearish_count >= 2:
                    overall_signal = 'bearish'
                else:
                    overall_signal = 'neutral'
                
                results[timeframe_key] = {
                    'name': config['name'],
                    'signals': signals,
                    'overall': overall_signal,
                    'data_points': len(data)
                }
                
            except Exception as e:
                logging.warning(f"Timeframe analysis failed for {timeframe_key}: {e}")
                continue
        
        # 시간대 간 일치도 계산
        if len(results) >= 2:
            overall_signals = [result['overall'] for result in results.values()]
            bullish_timeframes = sum(1 for signal in overall_signals if signal == 'bullish')
            bearish_timeframes = sum(1 for signal in overall_signals if signal == 'bearish')
            
            if bullish_timeframes >= 2:
                consensus = 'bullish'
                confidence = int((bullish_timeframes / len(results)) * 100)
            elif bearish_timeframes >= 2:
                consensus = 'bearish'
                confidence = int((bearish_timeframes / len(results)) * 100)
            else:
                consensus = 'mixed'
                confidence = 50
        else:
            consensus = 'insufficient_data'
            confidence = 0
        
        return {
            'timeframes': results,
            'consensus': consensus,
            'confidence': confidence,
            'total_timeframes': len(results)
        }
        
    except Exception as e:
        logging.error(f"Multi-timeframe analysis error: {e}")
        return {
            'timeframes': {},
            'consensus': 'error',
            'confidence': 0,
            'total_timeframes': 0
        }

def calculate_risk_metrics(data, market_data=None):
    """
    리스크 지표 계산 (MDD, 샤프비율, 베타)
    """
    try:
        returns = data['Close'].pct_change().dropna()
        
        # 1. Maximum Drawdown (MDD) 계산
        cumulative = (1 + returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max
        mdd = float(drawdown.min() * 100)  # 백분율
        
        # 2. 샤프 비율 계산 (연율화)
        risk_free_rate = 0.025  # 2.5% 무위험 수익률 (한국 국채 3년물 기준)
        annual_return = float(returns.mean() * 252)
        annual_volatility = float(returns.std() * np.sqrt(252))
        
        if annual_volatility > 0:
            sharpe_ratio = (annual_return - risk_free_rate) / annual_volatility
        else:
            sharpe_ratio = 0
            
        # 3. 베타 계산 (KOSPI 대비, 시장 데이터가 있는 경우)
        beta = None
        if market_data is not None and len(market_data) > 0:
            try:
                market_returns = market_data['Close'].pct_change().dropna()
                # 공통 기간 맞추기
                common_dates = returns.index.intersection(market_returns.index)
                if len(common_dates) > 30:
                    stock_returns_aligned = returns.loc[common_dates]
                    market_returns_aligned = market_returns.loc[common_dates]
                    
                    covariance = np.cov(stock_returns_aligned, market_returns_aligned)[0, 1]
                    market_variance = np.var(market_returns_aligned)
                    
                    if market_variance > 0:
                        beta = float(covariance / market_variance)
            except Exception as e:
                logging.warning(f"Beta calculation error: {e}")
                beta = None
        
        # 4. 변동성 (연율화)
        volatility = float(annual_volatility * 100)  # 백분율
        
        # 5. 승률 계산
        win_rate = float((returns > 0).sum() / len(returns) * 100)
        
        return {
            'mdd': round(mdd, 2),
            'sharpe_ratio': round(sharpe_ratio, 3),
            'beta': round(beta, 3) if beta is not None else None,
            'volatility': round(volatility, 2),
            'win_rate': round(win_rate, 1),
            'annual_return': round(annual_return * 100, 2)
        }
        
    except Exception as e:
        logging.error(f"Risk metrics calculation error: {e}")
        return {
            'mdd': None,
            'sharpe_ratio': None,
            'beta': None,
            'volatility': None,
            'win_rate': None,
            'annual_return': None
        }

def backtest_signals(data, dynamic_thresholds, lookback_days=30):
    """
    지표별 신호의 과거 성과를 백테스팅
    lookback_days: 백테스팅할 기간 (일)
    """
    try:
        if len(data) < lookback_days + 20:  # 최소 데이터 요구사항
            return {}
        
        results = {}
        
        # 백테스팅용 데이터 준비
        test_data = data.tail(lookback_days + 20).copy()  # 지표 계산을 위해 여유분 추가
        
        # 각 지표별 백테스팅
        results['rsi'] = backtest_rsi_signals(test_data, dynamic_thresholds)
        results['macd'] = backtest_macd_signals(test_data, dynamic_thresholds)
        results['bollinger'] = backtest_bollinger_signals(test_data, dynamic_thresholds)
        results['vwap'] = backtest_vwap_signals(test_data, dynamic_thresholds)
        
        return results
        
    except Exception as e:
        logging.warning(f"Error in backtest_signals: {e}")
        return {}

def backtest_rsi_signals(data, thresholds):
    """RSI 신호 백테스팅"""
    try:
        rsi = calculate_rsi(data['Close'])
        upper_threshold = thresholds.get('rsi', {}).get('upper_threshold', 70)
        lower_threshold = thresholds.get('rsi', {}).get('lower_threshold', 30)
        
        signals = []
        returns = []
        
        for i in range(20, len(data) - 5):  # 신호 발생 후 5일 수익률 측정
            current_rsi = rsi.iloc[i]
            if pd.isna(current_rsi):
                continue
                
            current_price = data['Close'].iloc[i]
            future_price = data['Close'].iloc[i + 5]  # 5일 후 가격
            
            if current_rsi > upper_threshold:  # 과매수 신호 (매도)
                signals.append('sell')
                returns.append((current_price - future_price) / current_price)  # 매도 수익률
            elif current_rsi < lower_threshold:  # 과매도 신호 (매수)
                signals.append('buy')
                returns.append((future_price - current_price) / current_price)  # 매수 수익률
        
        if not returns:
            return {'accuracy': 0, 'avg_return': 0, 'total_signals': 0, 'win_rate': 0}
        
        positive_returns = [r for r in returns if r > 0]
        accuracy = len(positive_returns) / len(returns) * 100
        avg_return = sum(returns) / len(returns) * 100
        win_rate = len(positive_returns) / len(returns) * 100
        
        return {
            'accuracy': round(accuracy, 1),
            'avg_return': round(avg_return, 2),
            'total_signals': len(returns),
            'win_rate': round(win_rate, 1),
            'period_days': 5
        }
        
    except Exception as e:
        logging.warning(f"Error in backtest_rsi_signals: {e}")
        return {'accuracy': 0, 'avg_return': 0, 'total_signals': 0, 'win_rate': 0}

def backtest_macd_signals(data, thresholds):
    """MACD 신호 백테스팅"""
    try:
        macd_params = thresholds.get('macd', {})
        macd_line, macd_signal, _ = calculate_macd(
            data['Close'],
            fast=macd_params.get('fast', 12),
            slow=macd_params.get('slow', 26),
            signal=macd_params.get('signal', 9)
        )
        
        signals = []
        returns = []
        
        for i in range(30, len(data) - 3):  # MACD는 더 많은 초기 데이터 필요
            prev_macd = macd_line.iloc[i-1]
            curr_macd = macd_line.iloc[i]
            prev_signal = macd_signal.iloc[i-1]
            curr_signal = macd_signal.iloc[i]
            
            if pd.isna(prev_macd) or pd.isna(curr_macd) or pd.isna(prev_signal) or pd.isna(curr_signal):
                continue
            
            current_price = data['Close'].iloc[i]
            future_price = data['Close'].iloc[i + 3]  # 3일 후 가격
            
            # 골든 크로스 (매수 신호)
            if prev_macd <= prev_signal and curr_macd > curr_signal:
                signals.append('buy')
                returns.append((future_price - current_price) / current_price)
            # 데드 크로스 (매도 신호)
            elif prev_macd >= prev_signal and curr_macd < curr_signal:
                signals.append('sell')
                returns.append((current_price - future_price) / current_price)
        
        if not returns:
            return {'accuracy': 0, 'avg_return': 0, 'total_signals': 0, 'win_rate': 0}
        
        positive_returns = [r for r in returns if r > 0]
        accuracy = len(positive_returns) / len(returns) * 100
        avg_return = sum(returns) / len(returns) * 100
        
        return {
            'accuracy': round(accuracy, 1),
            'avg_return': round(avg_return, 2),
            'total_signals': len(returns),
            'win_rate': round(accuracy, 1),
            'period_days': 3
        }
        
    except Exception as e:
        logging.warning(f"Error in backtest_macd_signals: {e}")
        return {'accuracy': 0, 'avg_return': 0, 'total_signals': 0, 'win_rate': 0}

def backtest_bollinger_signals(data, thresholds):
    """볼린저밴드 신호 백테스팅"""
    try:
        bb_params = thresholds.get('bollinger', {})
        upper, middle, lower = calculate_bbands(
            data['Close'],
            length=bb_params.get('period', 20),
            std=bb_params.get('std_dev', 2.0)
        )
        
        returns = []
        
        for i in range(25, len(data) - 3):
            current_price = data['Close'].iloc[i]
            future_price = data['Close'].iloc[i + 3]
            
            upper_val = upper.iloc[i]
            lower_val = lower.iloc[i]
            
            if pd.isna(upper_val) or pd.isna(lower_val):
                continue
            
            # 상단 돌파 (매수 신호) - 단순히 돌파만으로는 위험하므로 조건 완화
            if current_price > upper_val:
                returns.append((future_price - current_price) / current_price)
            # 하단 이탈 (매수 기회)
            elif current_price < lower_val:
                returns.append((future_price - current_price) / current_price)
        
        if not returns:
            return {'accuracy': 0, 'avg_return': 0, 'total_signals': 0, 'win_rate': 0}
        
        positive_returns = [r for r in returns if r > 0]
        accuracy = len(positive_returns) / len(returns) * 100
        avg_return = sum(returns) / len(returns) * 100
        
        return {
            'accuracy': round(accuracy, 1),
            'avg_return': round(avg_return, 2),
            'total_signals': len(returns),
            'win_rate': round(accuracy, 1),
            'period_days': 3
        }
        
    except Exception as e:
        logging.warning(f"Error in backtest_bollinger_signals: {e}")
        return {'accuracy': 0, 'avg_return': 0, 'total_signals': 0, 'win_rate': 0}

def backtest_vwap_signals(data, thresholds):
    """VWAP 신호 백테스팅"""
    try:
        vwap_period = thresholds.get('vwap', {}).get('period', 20)
        vwap = calculate_vwap(data['High'], data['Low'], data['Close'], data['Volume'], period=vwap_period)
        
        returns = []
        
        for i in range(25, len(data) - 2):
            current_price = data['Close'].iloc[i]
            future_price = data['Close'].iloc[i + 2]  # 2일 후
            current_vwap = vwap.iloc[i]
            
            if pd.isna(current_vwap):
                continue
            
            # VWAP 위/아래 기준 신호
            if current_price > current_vwap:  # VWAP 위 (매수 신호)
                returns.append((future_price - current_price) / current_price)
            elif current_price < current_vwap:  # VWAP 아래 (매도 또는 관망)
                returns.append((current_price - future_price) / current_price)
        
        if not returns:
            return {'accuracy': 0, 'avg_return': 0, 'total_signals': 0, 'win_rate': 0}
        
        positive_returns = [r for r in returns if r > 0]
        accuracy = len(positive_returns) / len(returns) * 100
        avg_return = sum(returns) / len(returns) * 100
        
        return {
            'accuracy': round(accuracy, 1),
            'avg_return': round(avg_return, 2),
            'total_signals': len(returns),
            'win_rate': round(accuracy, 1),
            'period_days': 2
        }
        
    except Exception as e:
        logging.warning(f"Error in backtest_vwap_signals: {e}")
        return {'accuracy': 0, 'avg_return': 0, 'total_signals': 0, 'win_rate': 0}


# --- 에러 핸들링 데코레이터 ---
from functools import wraps
import time

def handle_api_errors(f):
    """API 에러 처리 데코레이터"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except ValueError as e:
            logging.warning(f"Invalid input in {f.__name__}: {e}")
            return jsonify({
                "error": "잘못된 입력값입니다",
                "details": str(e),
                "code": "INVALID_INPUT"
            }), 400
        except ConnectionError as e:
            logging.error(f"Connection error in {f.__name__}: {e}")
            return jsonify({
                "error": "데이터 서버에 연결할 수 없습니다",
                "details": "잠시 후 다시 시도해주세요",
                "code": "CONNECTION_ERROR"
            }), 503
        except TimeoutError as e:
            logging.error(f"Timeout in {f.__name__}: {e}")
            return jsonify({
                "error": "요청 시간이 초과되었습니다",
                "details": "잠시 후 다시 시도해주세요",
                "code": "TIMEOUT"
            }), 504
        except Exception as e:
            logging.error(f"Unexpected error in {f.__name__}: {e}")
            return jsonify({
                "error": "서버 내부 오류가 발생했습니다",
                "details": "잠시 후 다시 시도해주세요",
                "code": "INTERNAL_ERROR"
            }), 500
    return decorated_function

def validate_ticker(ticker):
    """티커 유효성 검사"""
    if not ticker:
        raise ValueError("티커 심볼이 필요합니다")
    
    # 기본적인 형식 검사
    if len(ticker) > 10:
        raise ValueError("티커 심볼이 너무 깁니다")
    
    # 허용된 문자만 포함하는지 검사
    import re
    if not re.match(r'^[A-Za-z0-9.\-]+$', ticker):
        raise ValueError("티커 심볼에 허용되지 않은 문자가 포함되어 있습니다")
    
    return ticker.upper()

# --- API 1: 차트 데이터 (기술적 분석) ---
@app.route('/api/stock')
@limiter.limit("30 per minute")  # API별 세밀한 제한
@cache.memoize()
@handle_api_errors
def get_stock_data():
    ticker = request.args.get('ticker')
    data_range = request.args.get('range', '1y')
    interval = request.args.get('interval', '1d')

    # 입력값 검증
    ticker = validate_ticker(ticker)
    
    # yfinance에서 지원하는 정확한 범위와 간격
    valid_ranges = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']
    valid_intervals = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo']
    
    # 기간과 간격의 조합 제한 (yfinance 제한사항)
    period_interval_limits = {
        '1m': ['1d', '5d', '1mo'],       # 1분봉: 최대 1개월
        '2m': ['1d', '5d', '1mo'],       # 2분봉: 최대 1개월  
        '5m': ['1d', '5d', '1mo'],       # 5분봉: 최대 1개월
        '15m': ['1d', '5d', '1mo'],      # 15분봉: 최대 1개월
        '30m': ['1d', '5d', '1mo'],      # 30분봉: 최대 1개월
        '60m': ['1d', '5d', '1mo', '3mo'], # 1시간봉: 최대 3개월
        '90m': ['1d', '5d', '1mo', '3mo'], # 90분봉: 최대 3개월
        '1h': ['1d', '5d', '1mo', '3mo'],  # 1시간봉: 최대 3개월
        '1d': ['1d', '5d', '1mo', '3mo', '1y', 'max'], # 일봉: 모든 기간
        '5d': ['1mo', '3mo', '1y', 'max'], # 5일봉: 최소 1개월
        '1wk': ['1mo', '3mo', '1y', 'max'], # 주봉: 최소 1개월
        '1mo': ['1y', 'max'], # 월봉: 최소 1년
        '3mo': ['max']  # 분기봉: 전체 기간만
    }
    
    if data_range not in valid_ranges:
        raise ValueError(f"지원하지 않는 기간입니다. 허용된 값: {', '.join(valid_ranges)}")
    
    if interval not in valid_intervals:
        raise ValueError(f"지원하지 않는 간격입니다. 허용된 값: {', '.join(valid_intervals)}")
    
    # 기간과 간격 조합 검증
    if interval in period_interval_limits:
        allowed_periods = period_interval_limits[interval]
        if data_range not in allowed_periods:
            raise ValueError(f"{interval} 간격은 {', '.join(allowed_periods)} 기간에서만 사용 가능합니다.")

    # yfinance 요청 시도 (재시도 로직 포함)
    max_retries = 3
    for attempt in range(max_retries):
        try:
            stock = yf.Ticker(ticker)
            data = stock.history(period=data_range, interval=interval, timeout=app.config['API_TIMEOUT'])
            break
        except Exception as e:
            if attempt == max_retries - 1:
                if "404" in str(e) or "No data found" in str(e):
                    return jsonify({
                        "error": f"'{ticker}' 종목을 찾을 수 없습니다",
                        "details": "종목 심볼을 확인해주세요",
                        "code": "TICKER_NOT_FOUND"
                    }), 404
                raise e
            time.sleep(1)  # 재시도 전 잠시 대기

    if data.empty:
        return jsonify({
            "error": f"'{ticker}' 종목의 데이터가 없습니다",
            "details": "다른 기간이나 간격을 선택해보세요",
            "code": "NO_DATA"
        }), 404

    # 최소 데이터 포인트 확인
    if len(data) < 2:
        return jsonify({
            "error": "충분한 데이터가 없습니다",
            "details": "기술적 분석을 위해서는 더 많은 데이터가 필요합니다",
            "code": "INSUFFICIENT_DATA"
        }), 400

    # 동적 임계값 계산
    dynamic_thresholds = calculate_dynamic_thresholds(data)
    
    # 동적 파라미터를 적용한 기술적 지표 계산
    bbu, bbm, bbl = calculate_bbands(
        data['Close'], 
        length=dynamic_thresholds['bollinger']['period'],
        std=dynamic_thresholds['bollinger']['std_dev']
    )
    rsi = calculate_rsi(data['Close'])  # RSI는 계산 자체는 동일, 임계값만 동적 적용
    macd_line, macd_signal, macd_hist = calculate_macd(
        data['Close'],
        fast=dynamic_thresholds['macd']['fast'],
        slow=dynamic_thresholds['macd']['slow'],
        signal=dynamic_thresholds['macd']['signal']
    )
    vwap = calculate_vwap(
        data['High'], data['Low'], data['Close'], data['Volume'],
        period=dynamic_thresholds['vwap']['period']
    )

    # 신뢰도 메트릭스 계산
    confidence_metrics = calculate_confidence_metrics(data)
    
    # 각 지표별 신뢰도 계산
    confidences = {
        'vwap': calculate_indicator_confidence('VWAP', vwap.iloc[-1] if len(vwap) > 0 else None, confidence_metrics),
        'rsi': calculate_indicator_confidence('RSI', rsi.iloc[-1] if len(rsi) > 0 else None, confidence_metrics),
        'macd': calculate_indicator_confidence('MACD', macd_line.iloc[-1] if len(macd_line) > 0 else None, confidence_metrics),
        'bollinger': calculate_indicator_confidence('Bollinger', bbu.iloc[-1] if len(bbu) > 0 else None, confidence_metrics)
    }
    
    # 백테스팅 결과 계산
    backtest_results = backtest_signals(data, dynamic_thresholds)
    
    # KOSPI 데이터 가져오기 (베타 계산용)
    market_data = None
    try:
        kospi_ticker = yf.Ticker("^KS11")  # KOSPI 지수
        market_data = kospi_ticker.history(period=data_range, interval=interval, timeout=5)
        if market_data.empty:
            market_data = None
    except Exception as e:
        logging.warning(f"Market data fetch failed: {e}")
        market_data = None
    
    # 리스크 지표 계산
    risk_metrics = calculate_risk_metrics(data, market_data)
    
    # 다중 시간대 분석 (장기 분석에서만 실행)
    multi_timeframe = None
    if data_range in ['3mo', '6mo', '1y', '2y', '5y', 'max'] and interval in ['1d', '1wk']:
        multi_timeframe = analyze_multiple_timeframes(ticker, data_range)

    # 안전한 데이터 변환
    def safe_convert(series):
        return series.replace([np.inf, -np.inf], np.nan).replace({np.nan: None}).tolist()

    response_data = {
        "timestamp": [int(t.timestamp()) for t in data.index],
        "ohlc": {
            "open": safe_convert(data['Open']),
            "high": safe_convert(data['High']),
            "low": safe_convert(data['Low']),
            "close": safe_convert(data['Close']),
            "volume": safe_convert(data['Volume'])
        },
        "bbands": {
            "upper": safe_convert(bbu),
            "middle": safe_convert(bbm),
            "lower": safe_convert(bbl)
        },
        "rsi": safe_convert(rsi),
        "macd": {
            "line": safe_convert(macd_line),
            "signal": safe_convert(macd_signal),
            "histogram": safe_convert(macd_hist)
        },
        "vwap": safe_convert(vwap),
        "metadata": {
            "ticker": ticker,
            "period": data_range,
            "interval": interval,
            "data_points": len(data),
            "start_date": data.index[0].isoformat(),
            "end_date": data.index[-1].isoformat()
        },
        "confidence": {
            "indicators": confidences,
            "metrics": {
                "volume_ratio": round(confidence_metrics['volume_ratio'], 2),
                "volatility_ratio": round(confidence_metrics['volatility_ratio'], 2),
                "data_completeness": round(confidence_metrics['data_completeness'], 2),
                "data_quality_score": int(confidence_metrics['data_completeness'] * 100)
            },
            "warnings": generate_warnings(confidence_metrics, data)
        },
        "dynamic_analysis": {
            "thresholds": dynamic_thresholds,
            "is_optimized": True,
            "explanation": "이 종목의 특성에 맞게 최적화된 분석 파라미터가 적용되었습니다."
        },
        "risk_metrics": risk_metrics,
        "multi_timeframe": multi_timeframe,
        "backtest": {
            "results": backtest_results,
            "explanation": "최근 30일간 각 지표의 실제 성과를 기반으로 한 신호 검증 결과입니다.",
            "disclaimer": "과거 성과가 미래 수익을 보장하지 않습니다."
        }
    }
    
    return jsonify(response_data)


# --- API 2: 기업 정보 (펀더멘탈 스탯) 및 계산 모델 ---
@app.route('/api/stock/info')
@limiter.limit("20 per minute")  # 기업 정보는 더 제한적
@cache.memoize()
@handle_api_errors
def get_stock_info():
    ticker = request.args.get('ticker')
    ticker = validate_ticker(ticker)
    
    # yfinance 요청 시도 (재시도 로직 포함)
    max_retries = 3
    for attempt in range(max_retries):
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            time.sleep(1)
    
    # 기본 정보 확인
    if not info or len(info) < 5:  # 너무 적은 정보는 무효한 티커로 간주
        return jsonify({
            "error": f"'{ticker}' 종목의 정보를 찾을 수 없습니다",
            "details": "종목 심볼을 확인해주세요",
            "code": "TICKER_NOT_FOUND"
        }), 404
    
    # PE 값 결정
    pe_value = info.get('trailingPE')
    pe_type = 'Trailing PE'
    if pe_value is None:
        pe_value = info.get('forwardPE')
        pe_type = 'Forward PE'

    # 펀더멘탈 통계 계산
    try:
        stats = calculate_fundamental_stats(info)
    except Exception as e:
        logging.warning(f"Error calculating fundamental stats for {ticker}: {e}")
        stats = {
            "scores": {"value": 0, "growth": 0, "profitability": 0, "stability": 0},
            "totalScore": 0,
            "grade": "F (데이터 부족)"
        }
    
    # 안전한 값 추출
    def safe_get(key, default=None):
        value = info.get(key, default)
        # inf, -inf, nan 값 처리
        if isinstance(value, (int, float)):
            if np.isnan(value) or np.isinf(value):
                return None
        return value
    
    response_data = {
        "longName": safe_get("longName", ticker),
        "sector": safe_get("sector"),
        "country": safe_get("country"),
        "longBusinessSummary": safe_get("longBusinessSummary"),
        "stats": stats,
        "rawStats": { 
            "pe": pe_value, 
            "pe_type": pe_type,
            "earningsGrowth": safe_get('earningsGrowth'), 
            "roe": safe_get('returnOnEquity'), 
            "debtToEquity": safe_get('debtToEquity'),
            "marketCap": safe_get('marketCap'),
            "priceToBook": safe_get('priceToBook'),
            "dividendYield": safe_get('dividendYield')
        },
        "metadata": {
            "ticker": ticker,
            "currency": safe_get('currency'),
            "exchange": safe_get('exchange'),
            "quoteType": safe_get('quoteType'),
            "lastUpdated": time.time()
        }
    }
    
    return jsonify(response_data)

def calculate_fundamental_stats(info):
    scores = {'value': 0, 'growth': 0, 'profitability': 0, 'stability': 0}
    per = info.get('trailingPE')
    if per and isinstance(per, (int, float)) and per > 0:
        if per < 10: scores['value'] = 100
        elif per < 15: scores['value'] = 80
        elif per < 25: scores['value'] = 60
        else: scores['value'] = 30
    growth = info.get('earningsGrowth')
    if growth and isinstance(growth, (int, float)):
        if growth > 0.2: scores['growth'] = 100
        elif growth > 0.1: scores['growth'] = 80
        elif growth > 0: scores['growth'] = 60
        else: scores['growth'] = 20
    roe = info.get('returnOnEquity')
    if roe and isinstance(roe, (int, float)):
        if roe > 0.20: scores['profitability'] = 100
        elif roe > 0.15: scores['profitability'] = 80
        else: scores['profitability'] = 50
    debt_to_equity = info.get('debtToEquity')
    if debt_to_equity and isinstance(debt_to_equity, (int, float)):
        if debt_to_equity < 50: scores['stability'] = 100
        elif debt_to_equity < 100: scores['stability'] = 80
        elif debt_to_equity < 200: scores['stability'] = 50
        else: scores['stability'] = 20
    total_score = np.mean(list(scores.values()))
    grade = get_grade(total_score)
    return {"scores": scores, "totalScore": total_score, "grade": grade}

def get_grade(score):
    if score >= 80: return "A (매우 우수)"
    if score >= 70: return "B (우수)"
    if score >= 60: return "C (보통)"
    if score >= 50: return "D (주의)"
    return "F (위험)"


# --- 앱 실행 ---
if __name__ == '__main__':
    # 환경변수에서 포트 읽기 (Vercel 등에서 자동 할당)
    port = int(os.environ.get('PORT', 5000))
    debug = app.config['DEBUG']
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug
    )