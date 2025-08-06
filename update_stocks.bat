@echo off
echo ===================================
echo    주식 목록 업데이트 스크립트
echo ===================================
echo.

REM Python 가상환경 활성화 (있는 경우)
if exist "venv\Scripts\activate.bat" (
    echo 가상환경 활성화 중...
    call venv\Scripts\activate.bat
)

REM 필요한 패키지 설치
echo 필요한 패키지 설치 중...
pip install requests pandas

echo.
echo 주식 목록 업데이트 시작...
python update_stock_lists.py

echo.
echo 업데이트 완료! 아무 키나 누르세요...
pause