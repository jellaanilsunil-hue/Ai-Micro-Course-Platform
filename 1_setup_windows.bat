@echo off
REM ============================================================
REM  STEP 1 - run once: installs the Python and Node.js packages
REM  Needs Python 3.10-3.13 (with "Add to PATH" ticked) and Node.js LTS
REM  Tip: keep the folder path simple, e.g. C:\Projects\ai-micro-courses
REM ============================================================
cd /d "%~dp0"
set OK_BACK=0
set OK_FRONT=0

echo.
echo [1/2] Setting up the React frontend (npm install)...
pushd frontend
call npm install
if not errorlevel 1 set OK_FRONT=1
popd

echo.
echo [2/2] Setting up the Python backend (pip install)...
pushd backend
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
if not errorlevel 1 set OK_BACK=1
popd

echo.
echo ================= RESULT =================
if "%OK_FRONT%"=="1" (echo  Frontend: OK) else (echo  Frontend: FAILED - is Node.js installed? Restart the laptop after installing it.)
if "%OK_BACK%"=="1" (echo  Backend:  OK) else (echo  Backend:  FAILED - is Python 3.10-3.13 installed with "Add to PATH" ticked?)
if "%OK_FRONT%%OK_BACK%"=="11" echo  Setup complete. Now double-click 2_start_windows.bat
echo ==========================================
pause
