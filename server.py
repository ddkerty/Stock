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

def calculate_vwap(high, low, close, volume):
    typical_price = (high + low + close) / 3
    return (typical_price * volume).cumsum() / volume.cumsum()


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

    # 기술적 지표 계산
    bbu, bbm, bbl = calculate_bbands(data['Close'])
    rsi = calculate_rsi(data['Close'])
    macd_line, macd_signal, macd_hist = calculate_macd(data['Close'])
    vwap = calculate_vwap(data['High'], data['Low'], data['Close'], data['Volume'])

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