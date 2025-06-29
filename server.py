from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
import logging
import numpy as np

app = Flask(__name__)
CORS(app) # 모든 출처에서의 요청을 허용합니다.

# 로깅 설정
logging.basicConfig(level=logging.INFO)

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
        info = stock.info

        if data.empty:
            return jsonify({"error": "No data found for the given ticker and range"}), 404

        # 시가총액 추이 계산
        shares_outstanding = info.get('sharesOutstanding')
        market_cap_history = []
        if shares_outstanding:
            # 주가(Close)와 발행 주식 수를 곱하여 시가총액 계산
            market_cap_history = (data['Close'] * shares_outstanding).tolist()
        else:
            # 발행 주식 수 정보가 없는 경우, 빈 리스트 전달
            logging.warning(f"No sharesOutstanding data for {ticker}. Market cap history will be empty.")

        chart_data = {
            "chart": {
                "result": [
                    {
                        "timestamp": [int(t.timestamp()) for t in data.index],
                        "indicators": {
                            "quote": [
                                {
                                    "open": data['Open'].tolist(),
                                    "high": data['High'].tolist(),
                                    "low": data['Low'].tolist(),
                                    "close": data['Close'].tolist(),
                                    "volume": data['Volume'].tolist(),
                                }
                            ],
                            # 시가총액 추이 데이터 추가
                            "marketCapHistory": [market_cap_history]
                        }
                    }
                ]
            }
        }
        return jsonify(chart_data)

    except Exception as e:
        logging.error(f"Error fetching data for {ticker}: {e}")
        return jsonify({"error": "Failed to fetch data", "details": str(e)}), 500

@app.route('/api/stock/info')
def get_stock_info():
    ticker = request.args.get('ticker')
    if not ticker:
        return jsonify({"error": "Ticker is required"}), 400

    try:
        stock = yf.Ticker(ticker)
        info = stock.info

        if not info or info.get('regularMarketPrice') is None:
            return jsonify({"error": "Could not retrieve information for the ticker."}), 404

        fundamentals = {
            "marketCap": info.get("marketCap"),
            "forwardPE": info.get("forwardPE"),
            "trailingPE": info.get("trailingPE"),
            "trailingEps": info.get("trailingEps"),
            "dividendYield": info.get("dividendYield"),
            "beta": info.get("beta"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "longBusinessSummary": info.get("longBusinessSummary")
        }
        
        return jsonify(fundamentals)

    except Exception as e:
        logging.error(f"Error fetching fundamental data for {ticker}: {e}")
        return jsonify({"error": "Failed to fetch fundamental data", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)