# Navix

Jednoduche CLI pro evidenci vice lokalnich git projektu pod aliasy a spousteni prikazu nad vybranym projektem.

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

- Doporuceny rucne editovatelny config je `./navix.json`.
- Pri cteni se jako fallback bere i stary `./.navix/projects.json`, ale dalsi zapis jde do `./navix.json`.
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
    "sfxhotswap": {
      "alias": "sfxHotswap",
      "path": "../SFX-HotSwap",
      "webPath": "sfx",
      "webTarget": "http://127.0.0.1:4173"
    },
    "docs": {
      "alias": "docs",
      "webPath": "docs",
      "webTarget": "http://127.0.0.1:3000"
    }
  }
}
```

- Klic uvnitr `projects` musi byt lowercase alias.
- `path` muze byt relativni k umisteni `navix.json` nebo absolutni, ale u web-only entry muze chybet uplne.
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
