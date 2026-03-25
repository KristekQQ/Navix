# Navix

Jednoduche CLI pro evidenci vice lokalnich git projektu pod aliasy a spousteni prikazu nad vybranym projektem.

## Workspace bootstrap

Pro tenhle workspace jsou pripravene dva sync skripty:

Windows `cmd.exe`:

```bat
scripts\sync-projects.bat
```

Linux / WSL / bash:

```bash
bash ./scripts/sync-projects.sh
```

Pokud chces jednim prikazem vsechno synchronizovat, prepsat target porty na volne hodnoty a vsechny appky spustit, pouzij launcher:

Windows `cmd.exe`:

```bat
scripts\start-workspace.bat
```

Linux / WSL / bash:

```bash
bash ./scripts/start-workspace.sh
```

Launcher:

- nejdriv udela sync vsech repozitaru
- kdyz chybi `node_modules`, spusti v projektu `npm install`
- pro `WebP-Animator`, `panorama`, `SFX-HotSwap` a `Navix` proxy najde volne porty
- prepise `./.navix/projects.json`, aby route mirily na skutecne bezici targety
- spusti vsechny procesy na pozadi a logy ulozi do `./.navix/runtime/`
- pro `Navix` proxy preferuje port `80`; pokud je obsazeny nebo nepristupny, vezme dalsi volny port

Pro kontrolu bez spousteni procesu muzes pouzit:

```bash
node ./scripts/start-workspace.js --dry-run --no-install
```

Pro vypnuti celeho workspace:

Windows `cmd.exe`:

```bat
scripts\stop-workspace.bat
```

Linux / WSL / bash:

```bash
bash ./scripts/stop-workspace.sh
```

Skript bezi z rootu `Navix` a dela pro kazdy napojeny repozitar:

- pokud slozka neexistuje, provede `git clone`
- pokud existuje a obsahuje `.git`, provede `git fetch`, `git checkout <branch>` a `git pull --ff-only`
- pokud slozka existuje bez `.git`, skonci chybou, aby nic neprepsal

Aktualne obsluhuje:

- `../WebP-Animator` na branch `master`
- `../panorama` na branch `main`
- `../SFX-HotSwap` na branch `main`

Po synchronizaci je mas rovnou zaregistrovane v `./.navix/projects.json`.

## Prikazy

```bash
node index.js add <alias> <path>
node index.js add-web <alias> <webPath> <targetUrl> [path]
node index.js list
node index.js route <alias> <webPath> <targetUrl>
node index.js run <alias> -- <command> [args...]
node index.js serve [port]
```

## Chovani

- Hlavni rucne editovatelny config je `./.navix/projects.json`.
- V repu muze byt verzovany vzor `./.navix/projects.example.json`, aby bylo hned jasne, kam config patri.
- Pro tenhle konkretni workspace je v repu rovnou pripraven i `./.navix/projects.json`.
- Alias je case-insensitive pro lookup a musi odpovidat `[A-Za-z0-9_-]`.
- Relativni cesty se pri `add` ukladaji relativne k rootu Navix projektu, takze jsou prenositelnejsi mezi checkouty.
- `path` je volitelna pro ciste webove launcher entries, takze si muzes drzet i odkazy na projekty, kde nepotrebujes `run`.
- `run` spousti executable primo bez shellu, aby se omezily quoting problemy a injection rizika.
- `route` priradi web cestu typu `/sfx/` na lokalni web target.
- `add-web` vytvori zaznam primo do JSONu jednim prikazem, vcetne route a target URL.
- `serve` spusti jednoduchy reverse proxy server na `0.0.0.0`, takze funguje i pres `http://<tvoje-ip>:port/...`.
- Root index na `serve` ukazuje i primy odkaz na target URL, takze kdyz nektera appka pod subpath proxy zlobi, mas okamzity fallback.

## Doporuceny config format

```json
{
  "version": 1,
  "projects": {
    "webp-animator": {
      "alias": "WebP-Animator",
      "path": "../WebP-Animator",
      "webPath": "webp-animator",
      "webTarget": "http://127.0.0.1:5173"
    },
    "panorama": {
      "alias": "panorama",
      "path": "../panorama",
      "webPath": "panorama",
      "webTarget": "http://127.0.0.1:3000"
    },
    "sfx-hotswap": {
      "alias": "SFX-HotSwap",
      "path": "../SFX-HotSwap",
      "webPath": "sfx",
      "webTarget": "http://127.0.0.1:4173"
    }
  }
}
```

- Pro prvni setup muzes zkopirovat `./.navix/projects.example.json` na `./.navix/projects.json` nebo pouzit `add` / `add-web`, ktere soubor vytvori samy.
- Klic uvnitr `projects` musi byt lowercase alias.
- `path` muze byt relativni k umisteni `./.navix/projects.json` nebo absolutni, ale u web-only entry muze chybet uplne.
- `webPath` a `webTarget` musis definovat oba, nebo ani jeden.

## Priklady

```bash
node index.js add sfxHotswap ../sfx-hotswap
node index.js add-web docs docs http://127.0.0.1:3000
node index.js add-web admin admin http://127.0.0.1:5173 ../admin-ui
node index.js route sfxHotswap sfx http://127.0.0.1:4173
node index.js list
node index.js run sfxHotswap -- git status
node index.js run sfxHotswap -- npm test -- --watch
node index.js serve 8080
```

Pak otevri:

```text
http://127.0.0.1:8080/sfx/
http://<tvoje-ip>:8080/sfx/
```
