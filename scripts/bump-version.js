#!/usr/bin/env node
/**
 * Bumps the Android versionCode (and the patch of versionName) in app.json.
 *
 * Android keys some of its cached, optimised artifacts (dexopt output, the ART
 * profile) to the package plus versionCode. Installing a *different* build that
 * reuses the same versionCode lets it keep those stale artifacts against a new
 * JS bundle and dex, which shows up as "cannot find module" on first launch and
 * disappears after an uninstall. Every build that leaves this machine must
 * therefore carry a higher versionCode than the one before it.
 *
 * Run before `expo prebuild`:  node scripts/bump-version.js
 */

const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '..', 'app.json');
const config = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const expo = config.expo;

expo.android = expo.android ?? {};
const previousCode = Number(expo.android.versionCode ?? 0);
const nextCode = previousCode + 1;
expo.android.versionCode = nextCode;

// Keep versionName moving too, so a tester can read which build they have.
const parts = String(expo.version ?? '1.0.0').split('.');
while (parts.length < 3) parts.push('0');
parts[2] = String(Number(parts[2] || 0) + 1);
const previousName = expo.version;
expo.version = parts.join('.');

// iOS uses its own build number; keep it in step when present.
if (expo.ios) expo.ios.buildNumber = String(nextCode);

fs.writeFileSync(appJsonPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

console.log(
  `versionCode ${previousCode} -> ${nextCode}   versionName ${previousName} -> ${expo.version}`,
);
