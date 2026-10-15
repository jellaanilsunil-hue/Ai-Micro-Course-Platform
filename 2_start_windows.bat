@echo off
REM ============================================================
REM  STEP 2 - run every time: starts backend + frontend and opens the website
REM ============================================================
cd /d "%~dp0"
start "EduAI backend (Flask) - keep open" cmd /k "cd /d "%~dp0backend" && call .venv\Scripts\activate.bat && python app.py"
start "EduAI frontend (React) - keep open" cmd /k "cd /d "%~dp0frontend" && npm run dev"
echo Waiting for the servers to start...
timeout /t 12 /nobreak >nul
start "" http://localhost:5173
echo.
echo  Website: http://localhost:5173
echo  Student:   alice@chester.ac.uk / Student123!
echo  Professor: prof.chen@chester.ac.uk / Prof123!
echo  To stop: close the two black server windows.
pause
