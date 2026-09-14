# Ages of War

Browserové online multiplayer RTS (styl Warcraft 3 / Age of Empires). Éry: **Starověk**, **Druhá světová** (Sci-fi = roadmap).
Vše je procedurální – grafika, animace, hudba i zvuky se generují v prohlížeči, žádné externí soubory.

## Spuštění

Potřebuješ Node.js 18+.

```bash
npm install
npm start
```

nebo na Windows poklepej na `start.bat`. Pak otevři **http://localhost:8080**.

- **Rychlá hra proti AI** – založí lobby s botem zvolené obtížnosti, spustíš tlačítkem *Spustit hru*.
- **Hostovat hru** – vytvoří lobby; ostatní hráči na stejné síti otevřou `http://<tvoje-IP>:8080` (IP vypíše server při startu), dají *Připojit se* a v seznamu serverů kliknou na tvou hru. Do lobby lze přidat boty (lehký / střední / těžký / nemožný), měnit frakce, týmy a barvy.
- Port lze změnit: `PORT=9000 npm start`.

## Hra

- Dvě suroviny: hlavní z dolů (Zlato / Ropa – dělník vejde dovnitř a vynese náklad) a vedlejší ze stromů (Dřevo).
- Budovy: Radnice, Kasárna, Stáje / Tanková továrna, Obléhací dílna / Dělostřelecký park, Přístav / Loděnice, Věž / Bunkr, Hradba (+ Brána).
- **Tiery**: každou vojenskou budovu lze vylepšit (klávesa U) – každá úroveň odemkne nové jednotky. Radnici lze vylepšit až na úroveň 4 (Radnice → Město → Metropole → Císařské město), vyšší úroveň je podmínkou pro tiery ostatních budov a úroveň 4 odemkne **hrdinu** (jen jeden, spojenci v okolí +20 % útok).
- **Hradby** se pokládají klikem na začátek a konec – cesta obejde stromy, budovy i vodu. Vybraný segment lze změnit na **bránu** (G), kterou projdou jen tvé jednotky a spojenci.
- **Věže / bunkry** mají 3 úrovně (U): víc útoku, dosahu i pancíře, a jiný vzhled.
- Když ti spadne prohlížeč nebo obnovíš stránku, hra běží dál a po načtení se **automaticky připojíš zpět** do své rozehrané hry (server ji drží 3 minuty).
- Hudbu lze ztlumit tlačítkem v horní liště, ostatní nastavení jsou v menu (Esc).
- Cíl: zničit všechny nepřátelské budovy (kromě hradeb).

## Ovládání

| Akce | Ovládání |
|---|---|
| Výběr | levé tlačítko / tažení rámečku, Shift = přidat, dvojklik = všechny stejného typu |
| Rozkaz | pravé tlačítko (jdi / útoč / těž / stav / oprav), Shift = fronta |
| Útočný pochod | A + klik |
| Stop / držet pozici | S / H |
| Dělník | G = těžit hlavní surovinu, F = těžit dřevo, B = stavět, R = opravit |
| Budova | Q W E R T Z = výcvik, U = vylepšit, Y = shromaždiště, X = zrušit frontu, Delete = zbourat, G = brána (u hradby) |
| Skupiny | Ctrl+1–9 uložit, 1–9 vybrat, 2× = kamera |
| Kamera | šipky, okraj obrazovky, střední tlačítko, kolečko = zoom, minimapa |
| Ostatní | Space = poslední útok, F1 = vybrat armádu, . = nečinný dělník, Enter = chat, Esc = zrušit / menu |

## Struktura

- `server/index.js` – HTTP + WebSocket server, lobby, herní místnosti, autoritativní simulace (20 tick/s, delta snapshoty 10×/s).
- `shared/` – herní data (éry, frakce, jednotky, budovy, tiery), generátor mapy, pathfinding (A*), simulace, AI.
- `client/` – menu, lobby, HUD, síť, procedurální izometrická grafika (`render/`) a zvuk (`audio.js`).
- `tools/headless.js` – AI vs AI simulace bez prohlížeče (`node tools/headless.js ww2 7200`), `tools/tiertest.js` – test tierů, hrdiny a bran.
