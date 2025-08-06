#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
주식 목록 업데이트 스크립트
- KRX (한국거래소) 주식 목록 크롤링
- NASDAQ 주식 목록 크롤링
- CSV 파일로 저장
"""

import requests
import pandas as pd
import json
import time
from datetime import datetime
import os
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class StockListUpdater:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
    
    def update_krx_stocks(self):
        """한국거래소 주식 목록 업데이트"""
        logger.info("KRX 주식 목록 업데이트 시작...")
        
        try:
            # KRX 상장종목 API 호출
            url = "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd"
            
            # KOSPI 데이터
            kospi_data = {
                'bld': 'dbms/MDC/STAT/standard/MDCSTAT01501',
                'mktId': 'STK',
                'trdDd': datetime.now().strftime('%Y%m%d'),
                'money': '1',
                'csvxls_isNo': 'false'
            }
            
            # KOSDAQ 데이터
            kosdaq_data = {
                'bld': 'dbms/MDC/STAT/standard/MDCSTAT01501',
                'mktId': 'KSQ',
                'trdDd': datetime.now().strftime('%Y%m%d'),
                'money': '1',
                'csvxls_isNo': 'false'
            }
            
            stocks = []
            
            # KOSPI 주식 가져오기
            logger.info("KOSPI 주식 목록 가져오는 중...")
            response = self.session.post(url, data=kospi_data)
            if response.status_code == 200:
                kospi_stocks = response.json().get('OutBlock_1', [])
                for stock in kospi_stocks:
                    stocks.append({
                        'Symbol': stock.get('ISU_SRT_CD', ''),
                        'Name': stock.get('ISU_ABBRV', ''),
                        'Market': 'KOSPI'
                    })
                logger.info(f"KOSPI 주식 {len(kospi_stocks)}개 수집 완료")
            
            time.sleep(1)  # API 호출 간격
            
            # KOSDAQ 주식 가져오기
            logger.info("KOSDAQ 주식 목록 가져오는 중...")
            response = self.session.post(url, data=kosdaq_data)
            if response.status_code == 200:
                kosdaq_stocks = response.json().get('OutBlock_1', [])
                for stock in kosdaq_stocks:
                    stocks.append({
                        'Symbol': stock.get('ISU_SRT_CD', ''),
                        'Name': stock.get('ISU_ABBRV', ''),
                        'Market': 'KOSDAQ'
                    })
                logger.info(f"KOSDAQ 주식 {len(kosdaq_stocks)}개 수집 완료")
            
            # DataFrame으로 변환 및 정리
            df = pd.DataFrame(stocks)
            df = df[df['Symbol'] != '']  # 빈 심볼 제거
            df = df.drop_duplicates(subset=['Symbol'])  # 중복 제거
            df = df.sort_values('Symbol')  # 정렬
            
            # CSV 저장
            df.to_csv('krx_stock_list.csv', index=False, encoding='utf-8-sig')
            logger.info(f"KRX 주식 목록 업데이트 완료: {len(df)}개 종목")
            
            return True
            
        except Exception as e:
            logger.error(f"KRX 주식 목록 업데이트 실패: {e}")
            return False
    
    def update_nasdaq_stocks(self):
        """NASDAQ 주식 목록 업데이트"""
        logger.info("NASDAQ 주식 목록 업데이트 시작...")
        
        try:
            # NASDAQ API 사용 (공개 API)
            url = "https://api.nasdaq.com/api/screener/stocks"
            params = {
                'tableonly': 'true',
                'limit': '5000',
                'offset': '0',
                'download': 'true'
            }
            
            headers = {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            response = self.session.get(url, params=params, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                stocks_data = data.get('data', {}).get('rows', [])
                
                stocks = []
                for stock in stocks_data:
                    symbol = stock.get('symbol', '')
                    name = stock.get('name', '')
                    
                    # 기본적인 필터링 (ETF, 우선주 등 제외)
                    if (symbol and name and 
                        not symbol.endswith('.WS') and  # 워런트 제외
                        not symbol.endswith('.RT') and  # 권리 제외
                        not symbol.endswith('.UN') and  # 유닛 제외
                        len(symbol) <= 5):  # 너무 긴 심볼 제외
                        
                        stocks.append({
                            'Symbol': symbol,
                            'Company Name': name
                        })
                
                # DataFrame으로 변환 및 정리
                df = pd.DataFrame(stocks)
                df = df.drop_duplicates(subset=['Symbol'])  # 중복 제거
                df = df.sort_values('Symbol')  # 정렬
                
                # 상위 1000개만 선택 (너무 많으면 성능 저하)
                df = df.head(1000)
                
                # CSV 저장
                df.to_csv('nasdaq_stock_list.csv', index=False, encoding='utf-8-sig')
                logger.info(f"NASDAQ 주식 목록 업데이트 완료: {len(df)}개 종목")
                
                return True
            else:
                logger.error(f"NASDAQ API 호출 실패: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"NASDAQ 주식 목록 업데이트 실패: {e}")
            return False
    
    def update_all(self):
        """모든 주식 목록 업데이트"""
        logger.info("=== 주식 목록 업데이트 시작 ===")
        
        krx_success = self.update_krx_stocks()
        time.sleep(2)  # API 호출 간격
        nasdaq_success = self.update_nasdaq_stocks()
        
        # 업데이트 시간 기록
        with open('last_update.txt', 'w', encoding='utf-8') as f:
            f.write(f"마지막 업데이트: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"KRX 업데이트: {'성공' if krx_success else '실패'}\n")
            f.write(f"NASDAQ 업데이트: {'성공' if nasdaq_success else '실패'}\n")
        
        if krx_success and nasdaq_success:
            logger.info("=== 모든 주식 목록 업데이트 완료 ===")
        else:
            logger.warning("=== 일부 주식 목록 업데이트 실패 ===")
        
        return krx_success and nasdaq_success

def main():
    """메인 실행 함수"""
    updater = StockListUpdater()
    success = updater.update_all()
    
    if success:
        print("✅ 주식 목록 업데이트가 성공적으로 완료되었습니다!")
    else:
        print("❌ 주식 목록 업데이트 중 오류가 발생했습니다.")
    
    return success

if __name__ == "__main__":
    main()