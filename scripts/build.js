#!/usr/bin/env node
/**
 * DTI Release Build Pipeline
 *
 * Generates Chrome-importable release packages from source.
 * Reads version from manifest.json — no hardcoded versions.
 *
 * Output (in dist/):
 *   DeepSeek-Immersive-Translator-v<version>.zip    — Chrome Web Store uploadable
 *   DeepSeek-Immersive-Translator-v<version>.crx    — local installable
 *
 * Usage:
 *   node scripts/build.js             # Full build (ZIP + CRX)
 *   node scripts/build.js --zip-only  # ZIP only
 *   node scripts/build.js --crx-only  # CRX only
 *   node scripts/build.js --validate  # Validate manifest only
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Paths ──────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const KEY_PATH = path.join(ROOT, 'key.pem');

// Chrome paths (macOS → Linux → fallback)
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

// ── CLI args ───────────────────────────────────────

const args = process.argv.slice(2);
const ZIP_ONLY = args.includes('--zip-only');
const CRX_ONLY = args.includes('--crx-only');
const VALIDATE_ONLY = args.includes('--validate');

// ── Helpers ────────────────────────────────────────

function log(msg)  { console.log('\x1b[36m[build]\x1b[0m', msg); }
function ok(msg)   { console.log('\x1b[32m[build]\x1b[0m', msg); }
function warn(msg) { console.log('\x1b[33m[build]\x1b[0m', msg); }
function die(msg)  { console.error('\x1b[31m[build]\x1b[0m', msg); process.exit(1); }

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ── Step 1: Validate manifest ──────────────────────

function validateManifest() {
  log('Validating manifest.json ...');

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    die('manifest.json is not valid JSON: ' + e.message);
  }

  const required = ['manifest_version', 'name', 'version'];
  for (const key of required) {
    if (!manifest[key]) die(`manifest.json missing required field: "${key}"`);
  }

  if (manifest.manifest_version !== 3) {
    die('manifest_version must be 3 (Manifest V3 required for Chrome Web Store)');
  }

  // Validate version format (semver: X.Y.Z)
  const semver = /^\d+\.\d+\.\d+$/;
  if (!semver.test(manifest.version)) {
    die(`version "${manifest.version}" is not valid semver (expected X.Y.Z)`);
  }

  ok('manifest.json valid — v' + manifest.version + ' (MV3)');
  return manifest;
}

// ── Step 2: Prepare dist directory ─────────────────

function prepareDist(manifest) {
  fs.mkdirSync(DIST, { recursive: true });
  log('dist/ directory ready');
}

// ── Step 3: Build ZIP (via git archive) ────────────
//
//  git archive produces a clean export of HEAD, automatically excluding
//  everything in .gitignore. No manual file filtering needed.
//  Result: manifest.json at ZIP root ✓ Chrome Web Store compatible.

function buildZip(manifest) {
  const zipName = `DeepSeek-Immersive-Translator-v${manifest.version}.zip`;
  const zipPath = path.join(DIST, zipName);

  log(`Building ZIP: ${zipName} ...`);

  // Use git archive for clean, .gitignore-respecting export
  try {
    execSync(
      `git archive --format=zip --output="${zipPath}" HEAD`,
      { cwd: ROOT, stdio: 'pipe' }
    );
  } catch (e) {
    // Fallback: if git not available or not a repo, use system zip
    warn('git archive failed — falling back to system zip');
    const excludes = [
      '*.crx', '*.pem', '*.zip', '.env', '.env.*', '*.key',
      '.git', '.git/*', 'node_modules', 'node_modules/*',
      'dist', 'dist/*', '.vscode', '.vscode/*', '.idea', '.idea/*',
      '*.swp', '*.swo', '*~', '.DS_Store', 'Thumbs.db',
      '*.log', '*.bak', '*.tmp', '*.backup',
    ];
    const excludeArgs = excludes.map(e => `"${e}"`).join(' -x ');
    execSync(
      `cd "${ROOT}" && zip -r "${zipPath}" . -x ${excludeArgs}`,
      { stdio: 'pipe' }
    );
  }

  // Verify
  const stats = fs.statSync(zipPath);
  ok(`ZIP created: ${zipName} (${(stats.size / 1024).toFixed(1)} KB)`);
  return zipPath;
}

// ── Step 4: Build CRX (via Chrome --pack-extension) ─
//
//  Chrome's built-in packaging is the only reliable way to generate
//  valid CRX3 packages. First run generates key.pem; subsequent runs
//  reuse it (critical: same key = same extension ID).

function buildCrx(manifest) {
  const crxName = `DeepSeek-Immersive-Translator-v${manifest.version}.crx`;
  const crxPath = path.join(DIST, crxName);
  const chromeBin = findChrome();

  if (!chromeBin) {
    warn('Chrome not found — skipping CRX generation');
    warn('Install Chrome or set CHROME_BIN env var to enable CRX builds');
    return null;
  }

  log(`Building CRX (Chrome: ${chromeBin}) ...`);

  // Key management: first build lets Chrome generate key.pem; reuse for same ID
  const hasKey = fs.existsSync(KEY_PATH);
  if (!hasKey) {
    log('No key.pem found — Chrome will generate a new private key');
  } else {
    log('Reusing existing key.pem (preserves extension ID)');
  }

  // Chrome generates .crx and .pem as siblings of the extension directory:
  //   /path/to/DeepSeek-Immersive-Translator.crx
  //   /path/to/DeepSeek-Immersive-Translator.pem
  const generatedCrx = ROOT + '.crx';
  const generatedPem = ROOT + '.pem';

  // Clean up any stale generated files from previous runs
  try { fs.unlinkSync(generatedCrx); } catch {}
  try { fs.unlinkSync(generatedPem); } catch {}

  try {
    // Only pass --pack-extension-key if we have an existing key.
    // On first build, omit it so Chrome auto-generates the key.
    const keyArg = hasKey ? ` --pack-extension-key="${KEY_PATH}"` : '';
    const cmd = `"${chromeBin}" --pack-extension="${ROOT}"${keyArg}`;
    execSync(cmd, { stdio: 'pipe' });

    // Move generated .crx to dist/
    if (fs.existsSync(generatedCrx)) {
      fs.renameSync(generatedCrx, crxPath);
    } else {
      warn('CRX file not found after Chrome packaging');
      return null;
    }

    // Preserve generated key.pem to project root (first build only)
    if (fs.existsSync(generatedPem) && !hasKey) {
      fs.copyFileSync(generatedPem, KEY_PATH);
      log('key.pem saved to project root (keep this file for future builds)');
    }
    // Clean up generated pem
    try { fs.unlinkSync(generatedPem); } catch {}

    const stats = fs.statSync(crxPath);
    ok(`CRX created: ${crxName} (${(stats.size / 1024).toFixed(1)} KB)`);
    return crxPath;
  } catch (e) {
    warn('CRX packaging failed: ' + (e.stderr || e.message));
    warn('You can still install via "Load unpacked" or use the ZIP release');
    return null;
  }
}

// ── Main ───────────────────────────────────────────

function main() {
  console.log('');
  log('══════════════════════════════════════════');
  log('  DTI Release Build Pipeline');
  log('══════════════════════════════════════════');
  console.log('');

  // Validate always runs
  const manifest = validateManifest();

  if (VALIDATE_ONLY) {
    ok('Validation complete — manifest is ready for release');
    return;
  }

  prepareDist(manifest);

  const doZip = !CRX_ONLY;
  const doCrx = !ZIP_ONLY;

  if (doZip) buildZip(manifest);
  if (doCrx) buildCrx(manifest);

  console.log('');
  log('══════════════════════════════════════════');
  log('  Build complete — output in dist/');
  log('══════════════════════════════════════════');

  // List dist contents
  const files = fs.readdirSync(DIST);
  for (const f of files) {
    const st = fs.statSync(path.join(DIST, f));
    console.log('  ' + f + '  (' + (st.size / 1024).toFixed(1) + ' KB)');
  }
  console.log('');
}

main();
