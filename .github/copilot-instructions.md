# iCUE Widgets — Copilot Instructions

## Environment Setup (REQUIRED in every new PS session)

```powershell
$env:PATH = "C:\Program Files\nodejs;C:\Program Files\GitHub CLI;C:\Users\kian\AppData\Local\Programs\iCUEWidgetCLI\bin;" + $env:PATH
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

Node/npm are NOT on PATH by default in VS Code terminals. Always prepend above before running `node`, `npm`, `npx`, `gh`, or `icuewidget`.

## Tooling Versions

- Node v24.15.0 / npm v11.12.1 at `C:\Program Files\nodejs`
- gh CLI v2.92.0, authenticated as `kyleian`
- Git remote: SSH — `git@github.com:kyleian/icue-widgets.git`
- 7-Zip at `C:\Program Files\7-Zip\7z.exe`
- iCUE Widget CLI v0.2.3 at `C:\Users\kian\AppData\Local\Programs\iCUEWidgetCLI\bin\icuewidget.exe`
  - Installed from: https://help.corsair.com/hc/en-us/articles/31815645224461 (WidgetBuilder Kit)
  - **NOT on npm** — the release workflow uses zip fallback; local dev uses the installed CLI

## Project Structure

```
icue-widgets/
  widgets/discord/        # The widget source
  companion/              # Node.js/Express server — proxies Discord IPC → HTTP on 127.0.0.1:7575
  scripts/build.js        # Packages widget into dist/discord.icuewidget
  scripts/validate.js     # Validates widget structure (run before packaging)
  dist/discord.icuewidget # Built output (gitignored)
```

## Common Tasks

### Validate a widget

```powershell
cd d:\code\icue-widgets
node scripts/validate.js widgets/discord
```

**Always validate before packaging.**

### Build the .icuewidget package

```powershell
icuewidget package "D:\code\icue-widgets\widgets\discord" --output "D:\code\icue-widgets\dist\discord.icuewidget"
```

- `--output` is the full **file** path, not a directory
- Build succeeds even with warnings; only errors block packaging

### Install widget into iCUE (requires admin, then restart iCUE)

The `.icuewidget` import dialog in iCUE validates files. **Direct copy bypasses import and is the reliable method.**

```powershell
# Run as Administrator
Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command "Copy-Item -Recurse -Force ''D:\code\icue-widgets\widgets\discord'' ''C:\Program Files\Corsair\Corsair iCUE5 Software\widgets\DiscordVoice''"' -Wait
```

iCUE validates all folders in `C:\Program Files\Corsair\Corsair iCUE5 Software\widgets\` at startup.

### Run companion tests

```powershell
cd d:\code\icue-widgets\companion
npm install
npm test
```

### Run the companion server

```powershell
$env:DISCORD_CLIENT_ID = "YOUR_APP_ID"   # Required — from https://discord.com/developers/applications
cd d:\code\icue-widgets\companion
node index.js
```

## iCUE Widget Requirements (HARD-LEARNED — do not break these)

These rules are enforced by iCUE's HTML validator. Violating any causes "unsupported or corrupted file" on import or the widget to be skipped on startup.

### index.html

1. **Must start with `<!DOCTYPE html>`** (uppercase)
2. **Must have a non-empty `<title>` element** — iCUE logs `Can't load widget file without title` and skips it
3. **`<title>` can use `tr('Key')` only if `translation.json` has that key in `en.translation`** — if the key is missing, `tr()` resolves to an empty string → empty title → validation failure
4. **No self-closing tags** on block elements (`<meta>` with `/>`  is fine; block elements must use separate closing tags)
5. **Use `<!DOCTYPE html>` not `<!doctype html>`** — lowercase doctype works but uppercase matches all working Corsair widgets
6. **JS: use `catch (e) {}`** not bare `catch {}` — CLI validator uses ES2018 parser
7. **JS: use `var icueEvents = {`** not `icueEvents = {` — implicit globals cause CLI warnings

### translation.json

**Required format** (iCUE silently ignores wrong format, causing `tr()` to return empty string):

```json
{"en":{"translation":{"Key":"Value"}}}
```

**Wrong** (will compile but `tr()` always returns empty string):
```json
{"en":{"Key":"Value"}}
```

The nested `"translation"` object is mandatory. iCUE validates using `en_FAKE` locale; only keys in `en.translation` are used.

### manifest.json

Required fields: `author`, `id`, `name`, `description`, `version`, `preview_icon`, `min_framework_version`, `os`, `supported_devices`

- `id` must be reverse-DNS format: `com.author.widgetname`
- `version` must be semver: `1.0.0`
- `os` must be `[{"platform": "windows"}]`
- `supported_devices` valid types: `dashboard_lcd`, `keyboard_lcd`, `pump_lcd`
- **No `"title"` field** — not a valid manifest property, only `"name"` is used
- **No duplicate device entries** — having `dashboard_lcd` twice is invalid

### File structure in the zip

Files must be at the **root** of the zip (not inside a subdirectory). The CLI handles this automatically.

## GitHub Actions

- `ci.yml`: runs on push/PR — lint, validate, companion tests
- `release.yml`: runs on `v*.*.*` tags — validates, tests, zips widgets, creates GitHub release with `.icuewidget` attachments
- **CI uses zip fallback** (CLI not on npm) — packages are still valid; iCUE import is the validation gate

## Known Issues / Notes

- **Always `npm install`, never `npm ci`** — no lockfile committed
- **Never use interactive `gh` TUI commands** — `gh auth login` etc. corrupt terminal sessions; use `gh api` instead
- **PATH must be set every session** — VS Code PS terminals have stale PATH
- **iCUE log location**: `C:\Users\kian\AppData\Local\CORSAIR\Logs\CUE5\`
- **Installed user widgets**: `C:\Users\kian\AppData\Roaming\Corsair\CUE5\html_widgets\<guid>\` (set by import dialog)
- **Built-in widget location**: `C:\Program Files\Corsair\Corsair iCUE5 Software\widgets\<Name>\`

