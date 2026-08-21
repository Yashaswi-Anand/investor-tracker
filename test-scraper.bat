@echo off
title IPO Tracker - Scraper test (no database needed)
cd /d "%~dp0scraper"

echo Running unit tests...
python -m pytest tests/ -q
echo.
echo Fetching live data from NSE (dry run, nothing is saved)...
python run_once.py --dry-run
pause
