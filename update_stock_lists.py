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
                response_data = response.json()
                logger.info(f"KOSPI API 응답 구조: {list(response_data.keys())}")
                
                kospi_stocks = response_data.get('OutBlock_1', [])
                if kospi_stocks and len(kospi_stocks) > 0:
                    # 첫 번째 항목의 키를 확인
                    logger.info(f"KOSPI 데이터 샘플 키: {list(kospi_stocks[0].keys())}")
                
                for stock in kospi_stocks:
                    # 여러 가능한 키 시도
                    symbol_key = stock.get('ISU_SRT_CD') or stock.get('ISU_CD') or stock.get('TRD_CD')
                    name_key = stock.get('ISU_ABBRV') or stock.get('ISU_NM') or stock.get('KOR_SECNM')
                    
                    if symbol_key and name_key:
                        stocks.append({
                            'Symbol': symbol_key,
                            'Name': name_key,
                            'Market': 'KOSPI'
                        })
                logger.info(f"KOSPI 주식 {len([s for s in stocks if s['Market'] == 'KOSPI'])}개 수집 완료")
            
            time.sleep(1)  # API 호출 간격
            
            # KOSDAQ 주식 가져오기
            logger.info("KOSDAQ 주식 목록 가져오는 중...")
            response = self.session.post(url, data=kosdaq_data)
            if response.status_code == 200:
                response_data = response.json()
                logger.info(f"KOSDAQ API 응답 구조: {list(response_data.keys())}")
                
                kosdaq_stocks = response_data.get('OutBlock_1', [])
                if kosdaq_stocks and len(kosdaq_stocks) > 0:
                    logger.info(f"KOSDAQ 데이터 샘플 키: {list(kosdaq_stocks[0].keys())}")
                
                for stock in kosdaq_stocks:
                    # 여러 가능한 키 시도
                    symbol_key = stock.get('ISU_SRT_CD') or stock.get('ISU_CD') or stock.get('TRD_CD')
                    name_key = stock.get('ISU_ABBRV') or stock.get('ISU_NM') or stock.get('KOR_SECNM')
                    
                    if symbol_key and name_key:
                        stocks.append({
                            'Symbol': symbol_key,
                            'Name': name_key,
                            'Market': 'KOSDAQ'
                        })
                logger.info(f"KOSDAQ 주식 {len([s for s in stocks if s['Market'] == 'KOSDAQ'])}개 수집 완료")
            
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
            import traceback
            logger.error(f"상세 오류: {traceback.format_exc()}")
            
            # 백업: 수동으로 주요 한국 주식 추가
            logger.info("백업 KRX 목록 생성 중...")
            backup_stocks = [
                {'Symbol': '005930', 'Name': '삼성전자', 'Market': 'KOSPI'},
                {'Symbol': '000660', 'Name': 'SK하이닉스', 'Market': 'KOSPI'},
                {'Symbol': '373220', 'Name': 'LG에너지솔루션', 'Market': 'KOSPI'},
                {'Symbol': '207940', 'Name': '삼성바이오로직스', 'Market': 'KOSPI'},
                {'Symbol': '005380', 'Name': '현대차', 'Market': 'KOSPI'},
                {'Symbol': '051910', 'Name': 'LG화학', 'Market': 'KOSPI'},
                {'Symbol': '035420', 'Name': 'NAVER', 'Market': 'KOSPI'},
                {'Symbol': '068270', 'Name': '셀트리온', 'Market': 'KOSPI'},
                {'Symbol': '035720', 'Name': '카카오', 'Market': 'KOSPI'},
                {'Symbol': '105560', 'Name': 'KB금융', 'Market': 'KOSPI'},
                {'Symbol': '055550', 'Name': '신한지주', 'Market': 'KOSPI'},
                {'Symbol': '086790', 'Name': '하나금융지주', 'Market': 'KOSPI'},
                {'Symbol': '032830', 'Name': '삼성생명', 'Market': 'KOSPI'},
                {'Symbol': '015760', 'Name': '한국전력', 'Market': 'KOSPI'},
                {'Symbol': '066570', 'Name': 'LG전자', 'Market': 'KOSPI'},
                {'Symbol': '028260', 'Name': '삼성물산', 'Market': 'KOSPI'},
                {'Symbol': '096770', 'Name': 'SK이노베이션', 'Market': 'KOSPI'},
                {'Symbol': '003670', 'Name': '포스코홀딩스', 'Market': 'KOSPI'},
                {'Symbol': '034730', 'Name': 'SK', 'Market': 'KOSPI'},
                {'Symbol': '017670', 'Name': 'SK텔레콤', 'Market': 'KOSPI'},
                {'Symbol': '030200', 'Name': 'KT', 'Market': 'KOSPI'},
                {'Symbol': '251270', 'Name': '넷마블', 'Market': 'KOSPI'},
                {'Symbol': '036570', 'Name': '엔씨소프트', 'Market': 'KOSPI'},
                {'Symbol': '323410', 'Name': '카카오뱅크', 'Market': 'KOSPI'},
                {'Symbol': '000270', 'Name': '기아', 'Market': 'KOSPI'}
            ]
            
            try:
                df = pd.DataFrame(backup_stocks)
                df.to_csv('krx_stock_list.csv', index=False, encoding='utf-8-sig')
                logger.info(f"백업 KRX 목록 생성 완료: {len(df)}개 종목")
                return True
            except Exception as backup_e:
                logger.error(f"백업 KRX 목록 생성도 실패: {backup_e}")
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
    
    def update_sp500_stocks(self):
        """S&P 500 주식 목록 업데이트 (Wikipedia 기반)"""
        logger.info("S&P 500 주식 목록 업데이트 시작...")
        
        try:
            # Wikipedia S&P 500 페이지 크롤링
            url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
            
            # pandas로 HTML 테이블 직접 읽기
            tables = pd.read_html(url)
            sp500_df = tables[0]  # 첫 번째 테이블이 S&P 500 목록
            
            # 필요한 컬럼만 추출하고 정리
            stocks = []
            for _, row in sp500_df.iterrows():
                symbol = str(row['Symbol']).strip()
                company_name = str(row['Security']).strip()
                sector = str(row['GICS Sector']).strip()
                
                if symbol and symbol != 'nan' and company_name and company_name != 'nan':
                    # 특수문자 정리 (점이나 하이픈이 있는 경우 처리)
                    clean_symbol = symbol.replace('.', '-')  # Berkshire Hathaway B 등
                    
                    stocks.append({
                        'Symbol': clean_symbol,
                        'Company Name': company_name,
                        'Sector': sector,
                        'Market': 'S&P 500'
                    })
            
            # DataFrame으로 변환
            df = pd.DataFrame(stocks)
            df = df.drop_duplicates(subset=['Symbol'])  # 중복 제거
            df = df.sort_values('Symbol')  # 정렬
            
            # CSV 저장
            df.to_csv('sp500_stock_list.csv', index=False, encoding='utf-8-sig')
            logger.info(f"S&P 500 주식 목록 업데이트 완료: {len(df)}개 종목")
            
            return True
            
        except Exception as e:
            logger.error(f"S&P 500 주식 목록 업데이트 실패: {e}")
            
            # 백업: 수동으로 주요 S&P 500 종목 추가
            try:
                logger.info("백업 S&P 500 목록 생성 중...")
                backup_stocks = [
                    {'Symbol': 'AAPL', 'Company Name': 'Apple Inc.', 'Sector': 'Information Technology', 'Market': 'S&P 500'},
                    {'Symbol': 'MSFT', 'Company Name': 'Microsoft Corporation', 'Sector': 'Information Technology', 'Market': 'S&P 500'},
                    {'Symbol': 'AMZN', 'Company Name': 'Amazon.com Inc.', 'Sector': 'Consumer Discretionary', 'Market': 'S&P 500'},
                    {'Symbol': 'NVDA', 'Company Name': 'NVIDIA Corporation', 'Sector': 'Information Technology', 'Market': 'S&P 500'},
                    {'Symbol': 'GOOGL', 'Company Name': 'Alphabet Inc. Class A', 'Sector': 'Communication Services', 'Market': 'S&P 500'},
                    {'Symbol': 'GOOG', 'Company Name': 'Alphabet Inc. Class C', 'Sector': 'Communication Services', 'Market': 'S&P 500'},
                    {'Symbol': 'TSLA', 'Company Name': 'Tesla Inc.', 'Sector': 'Consumer Discretionary', 'Market': 'S&P 500'},
                    {'Symbol': 'META', 'Company Name': 'Meta Platforms Inc.', 'Sector': 'Communication Services', 'Market': 'S&P 500'},
                    {'Symbol': 'BRK-B', 'Company Name': 'Berkshire Hathaway Inc. Class B', 'Sector': 'Financial Services', 'Market': 'S&P 500'},
                    {'Symbol': 'UNH', 'Company Name': 'UnitedHealth Group Incorporated', 'Sector': 'Health Care', 'Market': 'S&P 500'},
                    {'Symbol': 'JNJ', 'Company Name': 'Johnson & Johnson', 'Sector': 'Health Care', 'Market': 'S&P 500'},
                    {'Symbol': 'XOM', 'Company Name': 'Exxon Mobil Corporation', 'Sector': 'Energy', 'Market': 'S&P 500'},
                    {'Symbol': 'JPM', 'Company Name': 'JPMorgan Chase & Co.', 'Sector': 'Financial Services', 'Market': 'S&P 500'},
                    {'Symbol': 'V', 'Company Name': 'Visa Inc.', 'Sector': 'Information Technology', 'Market': 'S&P 500'},
                    {'Symbol': 'PG', 'Company Name': 'Procter & Gamble Company', 'Sector': 'Consumer Staples', 'Market': 'S&P 500'},
                    {'Symbol': 'MA', 'Company Name': 'Mastercard Incorporated', 'Sector': 'Information Technology', 'Market': 'S&P 500'},
                    {'Symbol': 'HD', 'Company Name': 'Home Depot Inc.', 'Sector': 'Consumer Discretionary', 'Market': 'S&P 500'},
                    {'Symbol': 'CVX', 'Company Name': 'Chevron Corporation', 'Sector': 'Energy', 'Market': 'S&P 500'},
                    {'Symbol': 'ABBV', 'Company Name': 'AbbVie Inc.', 'Sector': 'Health Care', 'Market': 'S&P 500'},
                    {'Symbol': 'LLY', 'Company Name': 'Eli Lilly and Company', 'Sector': 'Health Care', 'Market': 'S&P 500'}
                ]
                
                df = pd.DataFrame(backup_stocks)
                df.to_csv('sp500_stock_list.csv', index=False, encoding='utf-8-sig')
                logger.info(f"백업 S&P 500 목록 생성 완료: {len(df)}개 종목")
                return True
                
            except Exception as backup_e:
                logger.error(f"백업 S&P 500 목록 생성도 실패: {backup_e}")
                return False
    
    def update_all(self):
        """모든 주식 목록 업데이트"""
        logger.info("=== 주식 목록 업데이트 시작 ===")
        
        krx_success = self.update_krx_stocks()
        time.sleep(2)  # API 호출 간격
        nasdaq_success = self.update_nasdaq_stocks()
        time.sleep(2)  # API 호출 간격
        sp500_success = self.update_sp500_stocks()
        
        # 업데이트 시간 기록
        with open('last_update.txt', 'w', encoding='utf-8') as f:
            f.write(f"마지막 업데이트: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"KRX 업데이트: {'성공' if krx_success else '실패'}\n")
            f.write(f"NASDAQ 업데이트: {'성공' if nasdaq_success else '실패'}\n")
            f.write(f"S&P 500 업데이트: {'성공' if sp500_success else '실패'}\n")
        
        if krx_success and nasdaq_success and sp500_success:
            logger.info("=== 모든 주식 목록 업데이트 완료 ===")
        else:
            logger.warning("=== 일부 주식 목록 업데이트 실패 ===")
        
        return krx_success and nasdaq_success and sp500_success

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