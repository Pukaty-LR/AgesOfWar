@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Nainstaluj Node.js z https://nodejs.org & pause & exit /b 1)
if not exist node_modules (echo Instaluji zavislosti... & call npm install --no-audit --no-fund)
start "" http://localhost:8080
echo Ages of War server bezi. Zavri toto okno pro ukonceni.
node server\index.js
pause
