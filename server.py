# server.py (Final Version - Including Web Page Serving)

import logging
import numpy as np
import pandas as pd
import yfinance as yf
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# --- Flask 앱 설정 ---
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)
logging.basicConfig(level=logging.INFO)

# --- 웹 페이지 및 정적 파일 라우팅 ---

@app.route('/')
def serve_index():
    """index.html 파일을 서비스합니다."""
    return send_from_directory('.', 'index.html')

# --- 직접 만드는 기술적 분석 함수들 ---
# (이전과 동일한 코드, 변경 없음)
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

# --- API 1: 차트 데이터 (기술적 분석) ---
@app.route('/api/stock')
def get_stock_data():
    ticker = request.args.get('ticker')
    data_range = request.args.get('range', '1y')
    interval = request.args.get('interval', '1d')

    if not ticker:
        return jsonify({"error": "Ticker is required"}), 400

    try:
        stock = yf.Ticker(ticker)
        data = stock.history(period=data_range, interval=interval)

        if data.empty:
            return jsonify({"error": f"No data found for ticker '{ticker}'"}), 404

        bbu, bbm, bbl = calculate_bbands(data['Close'])
        rsi = calculate_rsi(data['Close'])
        macd_line, macd_signal, macd_hist = calculate_macd(data['Close'])
        vwap = calculate_vwap(data['High'], data['Low'], data['Close'], data['Volume'])

        response_data = {
            "timestamp": [int(t.timestamp()) for t in data.index],
            "ohlc": { "open": data['Open'].replace({np.nan: None}).tolist(), "high": data['High'].replace({np.nan: None}).tolist(), "low": data['Low'].replace({np.nan: None}).tolist(), "close": data['Close'].replace({np.nan: None}).tolist(), "volume": data['Volume'].replace({np.nan: None}).tolist(), },
            "bbands": { "upper": bbu.replace({np.nan: None}).tolist(), "middle": bbm.replace({np.nan: None}).tolist(), "lower": bbl.replace({np.nan: None}).tolist(), },
            "rsi": rsi.replace({np.nan: None}).tolist(),
            "macd": { "line": macd_line.replace({np.nan: None}).tolist(), "signal": macd_signal.replace({np.nan: None}).tolist(), "histogram": macd_hist.replace({np.nan: None}).tolist(), },
            "vwap": vwap.replace({np.nan: None}).tolist(),
        }
        return jsonify(response_data)

    except Exception as e:
        logging.error(f"Error in get_stock_data for {ticker}: {e}")
        return jsonify({"error": "차트 데이터 조회 중 오류 발생", "details": str(e)}), 500

# --- API 2: 기업 정보 (펀더멘탈 스탯) 및 계산 모델 ---
# (이전과 동일한 코드, 변경 없음)
@app.route('/api/stock/info')
def get_stock_info():
    ticker = request.args.get('ticker')
    if not ticker: return jsonify({"error": "Ticker is required"}), 400
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
        if not info or not info.get('regularMarketPrice'): return jsonify({"error": f"'{ticker}'에 대한 기업 정보를 조회할 수 없습니다."}), 404
        stats = calculate_fundamental_stats(info)
        response_data = {
            "longName": info.get("longName"), "sector": info.get("sector"), "country": info.get("country"),
            "longBusinessSummary": info.get("longBusinessSummary"), "stats": stats,
            "rawStats": { "pe": info.get('trailingPE'), "earningsGrowth": info.get('earningsGrowth'), "roe": info.get('returnOnEquity'), "debtToEquity": info.get('debtToEquity') }
        }
        return jsonify(response_data)
    except Exception as e:
        logging.error(f"Error fetching info for {ticker}: {e}")
        return jsonify({"error": "기업 정보 조회 중 오류 발생", "details": str(e)}), 500

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
    app.run(debug=True, port=5000)