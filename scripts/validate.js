#!/usr/bin/env node
/**
 * Validates an iCUE widget directory against the manifest schema.
 * Usage: node scripts/validate.js <widget-directory>
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const REQUIRED_MANIFEST_FIELDS = [
  "author",
  "id",
  "name",
  "description",
  "version",
  "preview_icon",
  "min_framework_version",
  "os",
  "supported_devices",
];

const VALID_DEVICE_TYPES = ["dashboard_lcd", "keyboard_lcd", "pump_lcd"];
const VALID_PLATFORMS = ["windows"];
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const REVERSE_DNS_RE = /^[a-z0-9][a-z0-9\-.]*[a-z0-9]$/;
const REQUIRED_FILES = ["index.html", "manifest.json"];

function error(msg) {
  console.error(`  ✗ ${msg}`);
  return false;
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
  return true;
}

function validateManifest(widgetDir, manifest) {
  let valid = true;

  // Required fields
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null || manifest[field] === "") {
      error(`manifest.json: missing required field "${field}"`);
      valid = false;
    } else {
      ok(`manifest.json: has "${field}"`);
    }
  }

  // ID format
  if (manifest.id && !REVERSE_DNS_RE.test(manifest.id)) {
    error(`manifest.json: "id" must be reverse-DNS format (e.g. com.author.widget), got "${manifest.id}"`);
    valid = false;
  }

  // Version format
  if (manifest.version && !SEMVER_RE.test(manifest.version)) {
    error(`manifest.json: "version" must be semver (e.g. 1.0.0), got "${manifest.version}"`);
    valid = false;
  }

  // OS platform
  if (Array.isArray(manifest.os)) {
    for (const os of manifest.os) {
      if (!VALID_PLATFORMS.includes(os.platform)) {
        error(`manifest.json: unsupported platform "${os.platform}". Valid: ${VALID_PLATFORMS.join(", ")}`);
        valid = false;
      }
    }
  }

  // Supported devices
  if (Array.isArray(manifest.supported_devices)) {
    for (const device of manifest.supported_devices) {
      if (!VALID_DEVICE_TYPES.includes(device.type)) {
        error(`manifest.json: unknown device type "${device.type}". Valid: ${VALID_DEVICE_TYPES.join(", ")}`);
        valid = false;
      }
    }
  }

  // preview_icon file exists
  if (manifest.preview_icon) {
    const iconPath = join(widgetDir, manifest.preview_icon);
    if (!existsSync(iconPath)) {
      error(`manifest.json: preview_icon "${manifest.preview_icon}" not found at ${iconPath}`);
      valid = false;
    } else {
      ok(`preview_icon file exists`);
    }
  }

  return valid;
}

function validateWidget(widgetDir) {
  console.log(`\nValidating: ${widgetDir}`);
  let valid = true;

  // Check required files
  for (const file of REQUIRED_FILES) {
    const filePath = join(widgetDir, file);
    if (!existsSync(filePath)) {
      error(`Missing required file: ${file}`);
      valid = false;
    } else {
      ok(`Found ${file}`);
    }
  }

  // Parse and validate manifest
  const manifestPath = join(widgetDir, "manifest.json");
  if (existsSync(manifestPath)) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (err) {
      error(`manifest.json: invalid JSON — ${err.message}`);
      return false;
    }
    const manifestValid = validateManifest(widgetDir, manifest);
    if (!manifestValid) valid = false;
  }

  return valid;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/validate.js <widget-directory>");
  process.exit(1);
}

const widgetDir = resolve(args[0]);
if (!existsSync(widgetDir)) {
  console.error(`Directory not found: ${widgetDir}`);
  process.exit(1);
}

const passed = validateWidget(widgetDir);
if (passed) {
  console.log("\n✅ Validation passed\n");
  process.exit(0);
} else {
  console.log("\n❌ Validation failed\n");
  process.exit(1);
}
