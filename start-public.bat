@echo off
rem Spusti herni server a otevre ho do internetu pres Cloudflare Quick Tunnel (zdarma, bez uctu, bez hesla).
rem Verejna adresa (https://....trycloudflare.com) se vypise nize - tu posli kamaradum. Meni se pri kazdem spusteni.
cd /d "%~dp0"
if not exist bin\cloudflared.exe (
  echo Stahuji cloudflared od Cloudflare...
  if not exist bin mkdir bin
  curl -L -o bin\cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
start "Ages of War server" cmd /k node server\index.js
ping -n 4 127.0.0.1 >nul
echo.
echo  Verejna adresa hry je na radku "https://....trycloudflare.com" nize:
echo.
bin\cloudflared.exe tunnel --url http://localhost:8080
