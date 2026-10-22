@echo off
title FinMate AI - AI Finance Manager
cd /d "%~dp0"
echo.
echo  ================================================
echo    FinMate AI  -  AI Finance Manager (India)
echo    http://localhost:8000
echo    Login: apni real email se account banao
echo  ================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python nahi mila!
    echo LOCAL_SETUP.md kholo - STEP 1 me "Add to PATH" tick karna hai.
    pause
    exit /b 1
)

echo [1/3] Python packages check ho rahe hain...
python -m pip install -r requirements.txt --quiet --disable-pip-version-check

if not exist "frontend\dist\index.html" (
    echo [2/3] Frontend build ho raha hai (pehli baar, 1-2 min)...
    cd frontend
    call npm install
    call npm run build
    cd ..
) else (
    echo [2/3] Frontend pehle se built hai - skip.
)

echo [3/3] Server start ho raha hai...
echo     Browser me khulega: http://localhost:8000
echo     (Band karne ke liye ye window close karo)
echo.

start "" cmd /c "timeout /t 5 >nul & start http://localhost:8000"
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
pause
