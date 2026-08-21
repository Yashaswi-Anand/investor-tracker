@echo off
title IPO Tracker - Scheduler (runs every 30 min)
cd /d "%~dp0scraper"

if not exist .env (
    echo ERROR: scraper\.env not found.
    echo Copy scraper\.env.example to scraper\.env and add your Supabase keys.
    pause
    exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do set "%%a=%%b"

echo Starting scheduler. Leave this window open.
echo Press Ctrl+C to stop.
echo.
python scheduler.py
pause
