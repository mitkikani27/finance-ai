@echo off
title FinMate - Restart Backend
echo ================================================
echo  Purana backend band kar raha hun...
echo ================================================

:: Port 8000 pe jo bhi process ho, usse kill karo
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "0.0.0.0:8000.*LISTEN" 2^>nul') do (
    echo  Process %%a kill kar raha hun...
    taskkill /PID %%a /F >nul 2>&1
)

:: 2 second ruko taaki port free ho jaye
echo  Port free ho raha hai... (2 second wait)
timeout /t 2 /nobreak >nul

echo ================================================
echo  Backend start kar raha hun...
echo ================================================
cd backend
..\\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
