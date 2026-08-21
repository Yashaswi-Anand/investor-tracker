@echo off
title IPO Tracker - Website (Next.js)
cd /d "%~dp0web"

if not exist node_modules (
    echo Installing dependencies, this takes a minute...
    call npm install --no-audit --no-fund
)
if not exist .env.local (
    echo.
    echo WARNING: web\.env.local not found.
    echo Copy web\.env.example to web\.env.local and add your Supabase keys.
    echo The site will start but show no data.
    echo.
)

echo Starting website at http://localhost:3000
echo Press Ctrl+C to stop.
echo.
call npm run dev
pause
