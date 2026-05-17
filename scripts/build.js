#!/usr/bin/env node
/**
 * build.js — packages each widget in widgets/ into dist/<name>.icuewidget
 *
 * Uses the iCUE Widget CLI if available, otherwise falls back to zip.
 * On Windows: uses 7-Zip if available, otherwise PowerShell Compress-Archive.
 * On Linux/macOS: uses the zip command.
 *
 * Usage:
 *   node scripts/build.js               — builds all widgets
 *   node scripts/build.js widgets/discord — builds one widget
 */

import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from "fs";
import { join, basename, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = join(ROOT, "dist");

const targets = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => resolve(p))
  : readdirSync(join(ROOT, "widgets"))
      .map((d) => join(ROOT, "widgets", d))
      .filter((d) => statSync(d).isDirectory());

mkdirSync(DIST, { recursive: true });

// Detect tools
// The iCUE Widget CLI is not on npm. On Windows it is installed by the
// WidgetBuilder Kit from https://help.corsair.com/hc/en-us/articles/31815645224461
// Default install path: C:\Users\<user>\AppData\Local\Programs\iCUEWidgetCLI\bin\icuewidget.exe
// On CI (Linux) there is no CLI — always use the zip fallback there.
const CLI_CANDIDATES = [
  process.env.ICUEWIDGET_CLI, // allow override via env var
  "C:\\Users\\" + (process.env.USERNAME || "") + "\\AppData\\Local\\Programs\\iCUEWidgetCLI\\bin\\icuewidget.exe",
].filter(Boolean);
const cliPath = CLI_CANDIDATES.find((p) => p && existsSync(p));
const hasCLI = cliPath != null || spawnSync("icuewidget", ["--version"], { shell: true }).status === 0;
const cliExe = cliPath ? `"${cliPath}"` : "icuewidget";
const has7Zip =
  process.platform === "win32" &&
  existsSync("C:\\Program Files\\7-Zip\\7z.exe");

function run(cmd, cwd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

let built = 0;
let failed = 0;

for (const widgetDir of targets) {
  if (!existsSync(join(widgetDir, "manifest.json"))) {
    console.warn(`Skipping ${widgetDir} — no manifest.json`);
    continue;
  }

  const name = basename(widgetDir);
  const out = join(DIST, `${name}.icuewidget`);

  // Remove stale artifact
  if (existsSync(out)) rmSync(out);

  console.log(`\nPackaging: ${name}`);

  try {
    if (hasCLI) {
      run(`${cliExe} package "${widgetDir}" --output "${out}"`, ROOT);
    } else if (has7Zip) {
      run(
        `"C:\\Program Files\\7-Zip\\7z.exe" a -tzip "${out}" *`,
        widgetDir
      );
    } else if (process.platform === "win32") {
      // PowerShell fallback
      run(
        `powershell -NoProfile -Command "Compress-Archive -Path '${widgetDir}\\*' -DestinationPath '${out}' -Force"`,
        ROOT
      );
    } else {
      run(`zip -r "${out}" .`, widgetDir);
    }

    console.log(`  ✓ ${out}`);
    built++;
  } catch (err) {
    console.error(`  ✗ Failed to package ${name}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone: ${built} built, ${failed} failed.`);
if (failed) process.exit(1);
