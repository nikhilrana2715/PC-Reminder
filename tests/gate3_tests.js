/**
 * Gate 3 Automated Test Suite
 * Tests:
 * - TEST15: PWA Installability & Manifest Compliance (Chrome / Edge / Android)
 * - Responsive Breakpoints Coverage (1920x1080, 1440x900, 768px, 390px, 360px)
 * - Neumorphic Design System & Accessibility (:focus-visible, contrast, semantic HTML, ARIA)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runGate3Tests() {
  console.log('====================================================');
  console.log('🧪 RUNNING GATE 3 AUTOMATED VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // --- TEST 15: PWA INSTALLABILITY & MANIFEST VERIFICATION ---
  test('TEST15 [Part 1]: manifest.webmanifest exists and is valid JSON with required PWA fields', () => {
    const manifestPath = path.join(__dirname, '../manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest file must exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(manifest.name && manifest.name.trim().length > 0, 'Manifest must have a non-empty name');
    assert.ok(manifest.short_name && manifest.short_name.trim().length > 0, 'Manifest must have a short_name');
    assert.strictEqual(manifest.start_url, './index.html', 'start_url must point to ./index.html');
    assert.strictEqual(manifest.display, 'standalone', 'display must be standalone');
    assert.ok(manifest.background_color, 'background_color must be defined');
    assert.ok(manifest.theme_color, 'theme_color must be defined');
  });

  test('TEST15 [Part 2]: Manifest contains 192x192 & 512x512 standard & maskable PNG icons existing on disk', () => {
    const manifestPath = path.join(__dirname, '../manifest.webmanifest');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(Array.isArray(manifest.icons), 'manifest.icons must be an array');
    assert.ok(manifest.icons.length >= 3, 'manifest.icons must contain at least 3 icon entries');

    // 192x192 PNG
    const icon192 = manifest.icons.find(i => i.sizes === '192x192' && i.type === 'image/png' && i.purpose === 'any');
    assert.ok(icon192, 'Manifest must contain a 192x192 PNG icon with purpose any');
    const path192 = path.join(__dirname, '..', icon192.src);
    assert.ok(fs.existsSync(path192), `192x192 icon file must exist at ${path192}`);
    assert.ok(fs.statSync(path192).size > 500, '192x192 icon must not be empty');

    // 512x512 PNG
    const icon512 = manifest.icons.find(i => i.sizes === '512x512' && i.type === 'image/png' && i.purpose === 'any');
    assert.ok(icon512, 'Manifest must contain a 512x512 PNG icon with purpose any');
    const path512 = path.join(__dirname, '..', icon512.src);
    assert.ok(fs.existsSync(path512), `512x512 icon file must exist at ${path512}`);
    assert.ok(fs.statSync(path512).size > 1000, '512x512 icon must not be empty');

    // Maskable icon
    const maskableIcon = manifest.icons.find(i => i.purpose === 'maskable');
    assert.ok(maskableIcon, 'Manifest must contain at least one maskable icon for Android adaptive icons');
  });

  test('TEST15 [Part 3]: index.html links manifest, theme-color, and responsive viewport', () => {
    const htmlPath = path.join(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(html.includes('rel="manifest" href="manifest.webmanifest"'), 'index.html must link manifest.webmanifest');
    assert.ok(html.includes('name="viewport"'), 'index.html must have viewport meta tag');
    assert.ok(html.includes('name="theme-color"'), 'index.html must have theme-color meta tag');
  });

  test('TEST15 [Part 4]: Service Worker caches app shell and all icons', () => {
    const swPath = path.join(__dirname, '../sw.js');
    const swCode = fs.readFileSync(swPath, 'utf8');

    assert.ok(swCode.includes('icon-192.png'), 'sw.js must cache icon-192.png');
    assert.ok(swCode.includes('icon-512.png'), 'sw.js must cache icon-512.png');
    assert.ok(swCode.includes('manifest.webmanifest'), 'sw.js must cache manifest.webmanifest');
    assert.ok(swCode.includes('skipWaiting'), 'sw.js must call skipWaiting');
    assert.ok(swCode.includes('clients.claim'), 'sw.js must claim clients on activation');
  });

  // --- RESPONSIVE BREAKPOINTS COVERAGE ---
  test('RESPONSIVE: styles.css covers all required screen widths (1920x1080, 1440x900, 768px, 390px, 360px)', () => {
    const cssPath = path.join(__dirname, '../styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('min-width: 1600px'), 'Must support 1920x1080 desktop breakpoint (min-width: 1600px)');
    assert.ok(css.includes('max-width: 1440px'), 'Must support 1440x900 laptop breakpoint (max-width: 1440px)');
    assert.ok(css.includes('max-width: 768px'), 'Must support 768px tablet portrait breakpoint (max-width: 768px)');
    assert.ok(css.includes('max-width: 390px'), 'Must support 390px standard mobile breakpoint (max-width: 390px)');
    assert.ok(css.includes('max-width: 360px'), 'Must support 360px ultra-compact mobile breakpoint (max-width: 360px)');
  });

  // --- NEUMORPHISM DESIGN SYSTEM & ACCESSIBILITY ---
  test('NEUMORPHISM: Design tokens present for light and dark modes with soft dual-shadow offsets', () => {
    const cssPath = path.join(__dirname, '../styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('--neu-flat:'), 'CSS must define --neu-flat token');
    assert.ok(css.includes('--neu-pressed:'), 'CSS must define --neu-pressed token');
    assert.ok(css.includes('--neu-convex:'), 'CSS must define --neu-convex token');
    assert.ok(css.includes('data-theme="dark"'), 'CSS must support dark mode theme switching');
  });

  test('ACCESSIBILITY: Focus visibility styles and semantic HTML with ARIA roles', () => {
    const cssPath = path.join(__dirname, '../styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    assert.ok(css.includes(':focus-visible'), 'CSS must include :focus-visible rules for keyboard accessibility');

    const htmlPath = path.join(__dirname, '../index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('<aside'), 'index.html must use semantic <aside>');
    assert.ok(html.includes('<main'), 'index.html must use semantic <main>');
    assert.ok(html.includes('<header'), 'index.html must use semantic <header>');
    assert.ok(html.includes('<nav'), 'index.html must use semantic <nav>');
    assert.ok(html.includes('role="dialog"'), 'index.html must have ARIA dialog role');
    assert.ok(html.includes('role="listbox"'), 'index.html must have ARIA listbox role');
  });

  console.log('\n====================================================');
  console.log(`📊 GATE 3 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGate3Tests();
