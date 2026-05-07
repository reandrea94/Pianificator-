@echo off
:: ── OMAV Suite — Avvio ──
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Node.js non trovato.
    echo  Scaricalo da: https://nodejs.org
    echo.
    pause
    exit /b
)

if not exist "%~dp0server.js" (
    echo.
    echo  ERRORE: server.js non trovato nella cartella.
    echo  Assicurati che server.js sia nella stessa cartella di avvia.bat
    echo.
    pause
    exit /b
)

echo.
echo  Avvio OMAV Suite su http://localhost:8765
echo.

timeout /t 1 /nobreak >nul
start "" "http://localhost:8765"
node "%~dp0server.js"

echo.
echo  Il server si e' fermato.
pause
