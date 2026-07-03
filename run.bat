@echo off
REM HVAC POC 실행 스크립트 (Windows) — 더블클릭하면 설치 후 개발 서버가 실행됩니다.
cd /d "%~dp0"
echo [1/2] 의존성 설치 (최초 1회, 잠시 걸립니다)...
call npm install
echo.
echo [2/2] 개발 서버 시작... 종료하려면 이 창에서 Ctrl+C
echo 브라우저에서 아래 표시되는 http://localhost:5173 주소를 여세요.
echo.
call npm run dev
pause
