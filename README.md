# 📈 Stock Insight: 미국 & 한국 주식 분석 웹 (by 현진)

## 🌟 프로젝트 소개

`Stock Insight`는 미국 및 한국 주식 시장의 데이터를 통합하여 기술적 분석과 기업 펀더멘털 분석을 직관적인 웹 인터페이스로 제공하는 개인 프로젝트입니다. 
복잡한 주식 데이터를 한눈에 파악하고, 사용자 스스로 합리적인 투자 판단을 내리는 데 도움을 드리고자 개발되었습니다.

파이썬을 백엔드를 만들 수 있을지 테스트 겸, 실제 본인 투자에 활용할 겸 제작 했습니다.

## ✨ 주요 기능

* 통합 주식 검색: 한국(KOSPI, KOSDAQ) 및 미국(NASDAQ) 주식 종목을 통합 검색하여, 종목명 또는 티커로 쉽게 찾을 수 있습니다.
* 다양한 기간별 차트: 1개월, 3개월, 1년, 5년, 전체 기간에 대한 주식 차트를 제공합니다. (현재는 일봉 기준으로 제공)
* 기술적 지표 분석:
    * 볼린저 밴드 (Bollinger Bands): 주가의 상대적인 고점과 저점을 파악합니다.
    * RSI (Relative Strength Index): 주가의 상승/하락 강도를 측정하여 과매수/과매도 구간을 식별합니다.
    * MACD (Moving Average Convergence Divergence): 주가의 추세 전환 신호를 포착합니다.
    * VWAP (Volume Weighted Average Price): 거래량을 가중 평균한 가격으로, 기관 투자자의 매매 단가를 추정합니다.
* 기업 펀더멘털 분석:
    * 주요 재무 지표: PER (Trailing/Forward), ROE, 부채비율 등 핵심 펀더멘털 데이터를 조회합니다.
    * 종합 등급 평가: 가치, 성장성, 수익성, 안정성 4가지 지표를 기반으로 기업의 펀더멘털 종합 등급(A-F)을 시각적으로 제공합니다.
* 다크 모드 지원: 사용자 선호에 따라 밝은 모드와 어두운 모드를 전환할 수 있습니다.
* 최근 검색 기록: 최근 분석한 종목들을 빠르게 다시 조회할 수 있습니다.

## 🛠️ 기술 스택

이 프로젝트는 다음과 같은 기술 스택을 활용하여 개발되었습니다.

* 프론트엔드 (Frontend):
    * `HTML5`, `CSS3`
    * `JavaScript`
    * `Bootstrap 5.3.3`: 반응형 웹 디자인 및 깔끔한 UI 구축
    * `Chart.js`: 주식 차트 및 레이더 차트 시각화
    * `PapaParse`: CSV 파일 파싱
* 백엔드 (Backend):
    * `Python 3.x`
    * `Flask`: 경량 웹 프레임워크로 API 서버 구축
    * `Flask-Cors`: 교차 출처 리소스 공유(CORS) 처리
    * `yfinance`: Yahoo Finance API를 통한 주식 데이터 수집
    * `numpy`, `pandas`: 데이터 처리 및 수치 계산
* 배포 (Deployment):
    * `Vercel`: 프론트엔드 및 Flask 백엔드 서버리스 배포

## 🚀 프로젝트 실행 방법

1.  리포지토리 클론:
    ```bash
    git clone [현진님의 깃허브 리포지토리 주소]
    cd [프로젝트 폴더명]
    ```

2.  Python 환경 설정 및 의존성 설치:
    ```bash
    # 가상 환경 생성 (권장)
    python -m venv venv
    source venv/bin/activate  # macOS/Linux
    # venv\Scripts\activate  # Windows

    # 의존성 설치
    pip install -r requirements.txt
    ```
    * `requirements.txt` 파일에 `Flask-Caching`을 추가해 주세요!
        ```
        Flask
        Flask-Cors
        requests
        yfinance
        numpy
        pandas
        Flask-Caching
        ```

3.  Flask 서버 실행:
    ```bash
    python server.py
    ```
    서버는 기본적으로 `http://127.0.0.1:5000`에서 실행됩니다.

4.  웹 브라우저 접속:
    웹 브라우저에서 `http://127.0.0.1:5000`에 접속하여 서비스를 이용합니다.



## ⚠️ 면책 조항 (Disclaimer)

본 서비스는 투자 참고용으로만 활용되어야 하며, 실제 투자 자문이나 매수/매도 추천을 의미하지 않습니다. 서비스에서 제공하는 모든 정보는 오류가 있을 수 있으며, 과거 데이터는 미래 수익을 보장하지 않습니다. 본 서비스 이용으로 인한 투자 손실에 대해 개발자는 어떠한 책임도 지지 않습니다. 모든 투자 결정은 사용자 본인의 판단과 책임 하에 이루어져야 합니다.



---
