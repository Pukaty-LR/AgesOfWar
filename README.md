# Ages of War

Browserové online multiplayer RTS (styl Warcraft 3 / Age of Empires). Éry: Starověk, Druhá světová (Sci-fi = roadmap).

## Spuštění

Potřebuješ Node.js 18+.

```bash
npm install
npm start
```

Pak otevři **http://localhost:8080** v prohlížeči (Chrome / Edge / Firefox).

- **Rychlá hra proti AI** – okamžitě založí hru s botem.
- **Hostovat hru** – vytvoří lobby; ostatní hráči na stejné síti otevřou `http://<tvoje-IP>:8080` (IP vypíše server při startu), dají *Připojit se* a v seznamu serverů kliknou na tvou hru.
- Port lze změnit: `PORT=9000 npm start`.

## Ovládání

| Akce | Ovládání |
|---|---|
| Výběr | levé tlačítko / tažení rámečku, Shift = přidat, dvojklik = všechny stejného typu |
| Rozkaz | pravé tlačítko (jdi / útoč / těž / stav / oprav), Shift = fronta |
| Útočný pochod | A + klik |
| Stop / držet pozici | S / H |
| Stavba | vyber dělníka → B → budova → klik; hradba L: klik začátek, klik konec |
| Skupiny | Ctrl+1–9 uložit, 1–9 vybrat, 2× = kamera |
| Kamera | šipky, okraj obrazovky, střední tlačítko, kolečko = zoom, minimapa |
| Ostatní | Space = poslední útok, F1 = vybrat armádu, . = nečinný dělník, Enter = chat, Esc = zrušit / menu |

## Struktura

- `server/index.js` – HTTP + WebSocket server, lobby, herní místnosti, autoritativní simulace.
- `shared/` – herní data (éry, frakce, jednotky, budovy), generátor mapy, pathfinding, simulace, AI.
- `client/` – menu, lobby, HUD, síť, procedurální grafika (`render/`) a zvuk.
- `tools/headless.js` – AI vs AI simulace bez prohlížeče (`node tools/headless.js ww2 7200`).
