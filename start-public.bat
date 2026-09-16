@echo off
rem Spusti herni server a otevre ho do internetu pres localtunnel (verejna adresa se vypise v okne tunelu).
rem Kamaradi pri prvni navsteve zadaji "tunnel password" = vase verejna IP (vypise se nize).
cd /d "%~dp0"
start "Ages of War server" cmd /k node server\index.js
timeout /t 3 /nobreak >nul
for /f "delims=" %%i in ('curl -s https://loca.lt/mytunnelpassword') do set TUNNELPW=%%i
echo.
echo  Tunnel password (verejna IP): %TUNNELPW%
echo.
npx --yes localtunnel --port 8080
