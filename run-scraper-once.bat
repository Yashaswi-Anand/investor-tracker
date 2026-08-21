@echo off
title IPO Tracker - Scraper (single run)
cd /d "%~dp0scraper"

if not exist .env (
    echo ERROR: scraper\.env not found.
    echo Copy scraper\.env.example to scraper\.env and add your Supabase keys.
    pause
    exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do set "%%a=%%b"

echo Running scraper once...
echo.
python run_once.py

echo.
echo Finished with exit code %errorlevel%
pause
