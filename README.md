# Ages of War

Browserové online multiplayer RTS (styl Warcraft 3 / Age of Empires). Éry: **Starověk**, **Druhá světová** a **Sci-fi**.
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
- Budovy: Radnice, Kasárna, Stáje / Tanková továrna, Obléhací dílna / Dělostřelecký park (úroveň 1 protijednotková zbraň, úroveň 3 těžké obléhání), Přístav / Loděnice, Věž / Bunkr, Hradba (+ Brána).
- **Tiery**: každou vojenskou budovu lze vylepšit (klávesa U) – každá úroveň odemkne nové jednotky. Radnici lze vylepšit až na úroveň 4 (Radnice → Město → Metropole → Císařské město), vyšší úroveň je podmínkou pro tiery ostatních budov a úroveň 4 odemkne **hrdinu** (jen jeden, spojenci v okolí +20 % útok).
- **Hradby** se pokládají klikem na začátek a konec (během tažení se ukazuje délka a cena, červeně při nedostatku surovin) – cesta obejde stromy, budovy i vodu. Vybraný segment lze změnit na **bránu** (G), kterou projdou jen tvé jednotky a spojenci.
- **Věže / bunkry** mají 3 úrovně (U): víc útoku, dosahu i pancíře, a jiný vzhled.
- **Výzkumy** (styl kovárny z Age of Empires): v kasárnách, stájích a dílně lze zkoumat útok a pancíř pro pěchotu, jezdectvo/vozidla a obléhací stroje (klávesy I / O), každá éra má vlastní názvy.
- **Domy** (+10 populace, vylepšitelné na +15 a +20) ve všech érách, AI je staví, když se blíží limitu. AI také expanduje: když domácí důl dochází, postaví novou radnici u dalšího dolu (a nejdřív vyčistí jeho hlídače).
- **Ovládání jako ve Warcraftu 3**: skupina se přesouvá ve formaci (melee vpředu, střelci a obléhání vzadu), hlídkování (P), Tab přepíná podskupinu ve smíšeném výběru, Ctrl+klik vybere všechny stejného typu, Alt+klik označí místo spoluhráčům na minimapě.
- **Hrdina** má kromě aury i aktivní schopnost (C): Válečný pokřik / Rozkaz k útoku / Přetížení zbraní – 12 s +35 % útok a +2 pancíř pro spojence v okolí, přebití 60 s.
- Hrdina sbírá **zkušenosti** za zabité jednotky a budovy (úrovně 1–5: víc HP, útoku, širší aura). Neutrální **hlídači** (bandité / partyzáni / xeno šelmy) střeží vzdálené doly jako ve Warcraftu 3 – cenný zdroj zkušeností.
- **Výsadkové lodě** (Nákladní loď / Výsadkový člun / Hover transportér) z přístavu převezou až 8 pozemních jednotek: pravým klikem na loď se nalodí, klávesa U a klik na břeh je vylodí – jak v Age of Empires, ideální pro Ostrovy.
- **Hraní přes internet**: `start-public.bat` spustí server a otevře ho do světa přes Cloudflare Quick Tunnel (zdarma, bez účtu, bez hesla – odkaz se kamarádům otevře rovnou). Skript při prvním spuštění stáhne oficiální `cloudflared` do `bin/` a pak vypíše veřejnou adresu typu `https://xxxx.trycloudflare.com`. Klient se připojuje WebSocketem na stejnou adresu (wss), lobby, chat i hra fungují beze změny. Adresa se při každém spuštění mění; pevný název dává bezplatný Cloudflare účet s pojmenovaným tunelem (`cloudflared tunnel login`). Trvalé nasazení: server je obyčejná Node aplikace (`npm start`, port z proměnné `PORT`), přiložený `render.yaml` je blueprint pro bezplatnou službu na render.com (repozitář na GitHub → New → Blueprint).
- **Grafika**: výchozí styl je pixel art (každý sprite se peče na 1px mřížku s vlastní paletou a obrysem – jednotky, budovy, stromy, doly); v Nastavení → Grafika lze přepnout na „Kloubové 3D“ nebo „Původní ploché“. Vývojářský přehled spritů: `/dev/sprites.html`.
- Sci-fi **hover tanky** jsou vznášedla a projedou i mělkou vodou. Přehled hráčů se skóre je na F3 – v týmové hře tam jdou spojenci poslat suroviny (tribut, +100 / Shift +500), týmový chat začíná `/t `.
- **Léčitelé** (Léčitel / Zdravotník / Opravný dron) se cvičí v radnici od úrovně 2 a léčí zraněné spojence v okolí.
- Hru proti AI lze **uložit** (Esc → Uložit hru) a později **načíst** z hlavního menu; ukládá se celý stav včetně AI a prozkoumané mapy (soubory ve složce `saves/`). Každé 3 minuty (a při odchodu ze hry) se hra proti AI **automaticky ukládá** (položka „Automatické uložení“), uložené hry lze i mazat.
- **Mlha války** jako v Age of Empires: nepřátelské budovy, které jsi jednou viděl, zůstávají pod mlhou zakreslené jako vzpomínka, dokud místo znovu neprozkoumáš. Prozkoumaná mapa se drží na serveru, takže přežije obnovení stránky i načtení hry.
- **Encyklopedie** v menu ukazuje všechny jednotky, budovy, frakce a výzkumy každé éry. V singleplayeru jde v menu (Esc) nastavit rychlost hry 1× / 1,5× / 2×.
- Boti nesou jména vůdců frakcí (Caesar, Vercingetorix, Guderian, Žukov, Admirál Vega…), kamera si pamatuje pozice F5–F8 (Ctrl+F5 uloží).
- V lobby lze zadat **seed** mapy (stejný seed = stejná mapa) a zvolit **náhodnou frakci** pro hráče i boty; nastavit startovní suroviny a odkrytou mapu.
- **Mapy**: v lobby vybíráš styl (Pevnina s mořem, Řeka, Ostrovy, Pláně, Jezera) a velikost (72, 96, 128). Generátor vždy zaručí pozemní cestu mezi základnami.
- **Tři éry**: Starověk (Řím, Galové, Řecko, Kartágo), Druhá světová (Německo, Polsko, SSSR, USA, Británie) a Sci-fi (Terranská federace, Marťanská republika, Syntetici, Nomádi Prázdnoty) – každá s vlastními jednotkami, budovami, surovinami, hudbou a barevným tématem HUD.
- Když ti spadne prohlížeč nebo obnovíš stránku, hra běží dál a po načtení se **automaticky připojíš zpět** do své rozehrané hry (server ji drží 3 minuty).
- **Jazyky**: přepínač vlajek vpravo nahoře v menu – angličtina (výchozí), čeština, němčina, francouzština, španělština, polština, ruština. Kompletní překlad rozhraní i názvů jednotek a budov; delší popisy mimo EN/CS zatím anglicky.
- Hudbu lze ztlumit tlačítkem v horní liště, ostatní nastavení a nápověda jsou v menu (Esc). Ve hře proti AI menu zároveň **pozastaví** simulaci.
- Atmosféra: stíny mraků, den a noc s rozsvícenými okny, na některých mapách déšť (i se zvukem), ve sci-fi poletující spory.
- Kurzor mění tvar podle akce (útok, stavba, těžba, hlídka), po vyřazení lze hru sledovat dál, po konci hry se odkryje celá mapa.
- Obrazovka po hře ukazuje tabulku statistik a graf síly armády a ekonomiky všech hráčů v čase (jako v Age of Empires). Vylepšení radnice na vyšší úroveň ohlásí fanfára s bannerem.
- Po skončení hry proti AI jde tlačítkem **Hrát znovu** rozehrát odvetu se stejnými boty a stejným typem mapy. Načítací obrazovka ukazuje tipy k ovládání.
- Věž ukazuje dosah střelby už při pokládání i po výběru, hlavička smíšeného výběru vypisuje počty podle typu a u surovin v liště je vidět počet dělníků, kteří je těží (jako v Age of Empires).
- Panel výběru ukazuje efektivní útok a pancíř jako „základ +bonus“ (výzkumy, úroveň hrdiny, úroveň věže).
- **Střed mapy** (v přehledu hráčů F3 je vidět, kdo ho drží) skrývá nevyčerpatelnou zlatou žílu a čtyři prastaré stromy (nekonečné dřevo) – hlídané silnější tlupou; kdo drží střed, nikdy nevyhladoví.
- Dělníci po dostavění pokračují na další rozestavěnou budovu (hradby segment po segmentu), nečinní dělníci sami opravují poškozené budovy (jeden na budovu), léčitelé si sami hledají zraněné, nečinné jednotky přiběhnou na pomoc napadeným spojencům v okolí a útočící jednotky po zničení cíle pokračují na další nepřátele (ozbrojené jednotky mají přednost před budovami). Smíšená skupina jde tempem nejpomalejšího.
- Zamčené jednotky jsou na kartě budovy vidět šedě s požadovanou úrovní; kliknutí na portrét ve smíšeném výběru vybere všechny jednotky toho typu.
- **Výška terénu** hraje roli jako v Age of Empires: útok z kopce dolů +25 % poškození, do kopce −25 %.
- Cíl: zničit všechny nepřátelské budovy (kromě hradeb).

## Ovládání

| Akce | Ovládání |
|---|---|
| Výběr | levé tlačítko / tažení rámečku, Shift = přidat, dvojklik = všechny stejného typu |
| Rozkaz | pravé tlačítko (jdi / útoč / těž / stav / oprav / následuj vlastní jednotku), Shift = fronta |
| Útočný pochod | A + klik |
| Stop / držet pozici | S / H |
| Dělník | G = těžit hlavní surovinu, F = těžit dřevo, B = stavět, R = opravit |
| Budova | Q W E R T Z = výcvik (Shift = 5×), U = vylepšit, Y = místo srazu, X = zrušit frontu, Delete = zbourat, G = brána (u hradby) |
| Skupiny | Ctrl+1–9 (nebo Alt+1–9) uložit, 1–9 vybrat (na české klávesnici i Shift+číslo), 2× = kamera |
| Kamera | šipky, okraj obrazovky, střední tlačítko, kolečko = zoom, minimapa |
| Ostatní | Space = poslední útok, F1 = vybrat armádu, F2 = hrdina, F3 = přehled hráčů, F5–F8 = záložky kamery, Backspace = radnice, . = nečinný dělník, Enter = chat, Esc = zrušit / menu |

## Struktura

- `server/index.js` – HTTP + WebSocket server, lobby, herní místnosti, autoritativní simulace (20 tick/s, delta snapshoty 10×/s).
- `shared/` – herní data (éry, frakce, jednotky, budovy, tiery), generátor mapy, pathfinding (A*), simulace, AI.
- `client/` – menu, lobby, HUD, síť, procedurální izometrická grafika (`render/`) a zvuk (`audio.js`).
- `client/i18n.js` + `client/lang/*.js` – lokalizace (klíče = české zdrojové řetězce; chybějící překlad spadne na angličtinu, pak na češtinu).
- `npm test` – regresní test (`tools/smoke.js`: všechny éry × styly map se 4 AI a pokrytí příkazů), `tools/headless.js` – AI vs AI simulace bez prohlížeče (`node tools/headless.js ww2 7200`), `tools/tiertest.js` – test tierů, hrdiny a bran.

## Hraní přes internet (s kamarády)

Nejrychlejší cesta bez účtů: spusť  Tunnel password (verejna IP): 176.114.240.7

your url is: https://lucky-tables-read.loca.lt (nebo ručně  a v druhém okně ). Tunel vypíše veřejnou adresu typu , tu pošli kamarádům. Při první návštěvě zadají „tunnel password“ – to je tvoje veřejná IP (skript ji vypíše, jinak Not Found). Klient se připojuje WebSocketem na stejnou adresu (wss), takže lobby, chat i hra fungují beze změny. Adresa se při každém spuštění tunelu mění;  si vyžádá pevný název, pokud je volný.

Trvalé nasazení: server je obyčejná Node aplikace (Unknown command: "start"


Did you mean one of these?
  npm star # Mark your favorite packages
  npm stars # View packages marked as favorites
  npm start # Start a package
To see a list of supported npm commands, run:
  npm help, port z proměnné ), takže jde nahrát na Render/Railway/Fly – přiložený  popisuje bezplatnou webovou službu: repozitář dej na GitHub, na render.com zvol „New → Blueprint“ a vyber repozitář.
