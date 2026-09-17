@echo off
rem Spusti herni server otevreny do internetu (Cloudflare Quick Tunnel - zdarma, bez uctu, bez hesla).
rem Verejna adresa se vypise v okne a je videt i v menu hry (Adresa pro kamarady + tlacitko Kopirovat). Meni se pri kazdem spusteni.
cd /d "%~dp0"
if not exist bin\cloudflared.exe (
  echo Stahuji cloudflared od Cloudflare...
  if not exist bin mkdir bin
  curl -L -o bin\cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
node server\index.js --public
