@echo off
title Investor - Build Android app (TWA)
cd /d "%~dp0app"

echo ============================================================
echo  Investor - Android app build (Trusted Web Activity)
echo  Website must be live first: https://investor.socialriser.com
echo ============================================================
echo.

where bubblewrap >nul 2>nul
if errorlevel 1 (
    echo Installing Bubblewrap CLI...
    call npm install -g @bubblewrap/cli
)

if not exist twa-manifest.json (
    echo.
    echo STEP 1/2  bubblewrap init  -- answer the prompts like this:
    echo   JDK 17 / Android SDK download ............ Yes  (first time only, ~2 GB)
    echo   Domain ................................... investor.socialriser.com
    echo   Name of the application .................. Investor - IPO GMP Tracker
    echo   Short name ............................... Investor
    echo   Application ID ........................... com.socialriser.investor   ^<-- IMPORTANT, never changes
    echo   Starting version code .................... 1
    echo   Display mode ............................. standalone
    echo   Status bar / theme color ................. #4f46e5
    echo   Splash screen color ...................... #f5f7fb
    echo   Play Billing ............................. No
    echo   Geolocation permission ................... No
    echo   Key store location ....................... ./android.keystore
    echo   Key name (alias) ......................... investor
    echo   Create keystore now ...................... Yes  -- then choose TWO passwords
    echo.
    echo   WRITE DOWN the keystore and key passwords. Losing them = you can
    echo   never update the app on Play Store again.
    echo.
    pause
    call bubblewrap init --manifest https://investor.socialriser.com/manifest.webmanifest
    if errorlevel 1 ( echo init failed & pause & exit /b 1 )
)

echo.
echo STEP 2/2  bubblewrap build  (enter the two keystore passwords when asked)
echo.
call bubblewrap build
if errorlevel 1 ( echo build failed & pause & exit /b 1 )

echo.
echo ============================================================
echo  DONE. Files in app\:
echo    app-release-signed.apk   -- sideload on your phone to test
echo    app-release-bundle.aab   -- upload this to Play Console
echo.
echo  NEXT: run   bubblewrap fingerprint list
echo  and give Claude the SHA-256 line -- it goes into
echo  web\public\.well-known\assetlinks.json (removes the browser bar).
echo ============================================================
pause
