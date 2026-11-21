// Pliki wydania: aktualizator w tauri.conf.json, proba dymna w workflow, CZYTAJ.md dla znajomego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const czytaj = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('tauri.conf.json ma aktualizator z kluczem i adresem Cookies889/muszka', () => {
  const c = JSON.parse(czytaj('src-tauri/tauri.conf.json'));
  assert.equal(c.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(c.bundle.targets, ['nsis']);
  assert.equal(c.bundle.windows.nsis.installMode, 'currentUser');
  assert.deepEqual(c.bundle.windows.nsis.languages, ['Polish']);
  const u = c.plugins.updater;
  assert.match(Buffer.from(u.pubkey, 'base64').toString(), /minisign public key/);
  assert.deepEqual(u.endpoints, ['https://github.com/Cookies889/muszka/releases/latest/download/latest.json']);
  assert.equal(u.windows.installMode, 'passive');
});

test('workflow robi probe dymna przed tworzeniem wydania', () => {
  const w = czytaj('.github/workflows/wydanie.yml');
  assert.match(w, /runs-on: windows-latest/);
  const proba = w.indexOf('Próba dymna');
  const wydanie = w.indexOf('tauri-apps/tauri-action');
  assert.ok(proba > 0 && wydanie > proba, 'proba dymna musi stac przed tauri-action');
  assert.match(w, /muszka\.exe/);
  assert.match(w, /Start-Sleep -Seconds 15/);
  assert.match(w, /Get-Process -Id/);
});

test('CZYTAJ.md mowi o trybie ekranu, skrocie, zasobniku i SmartScreen', () => {
  const t = czytaj('CZYTAJ.md');
  for (const s of ['Pełny ekran w oknie', 'Alt+Shift+Z', 'zasobnik', 'Uruchom mimo to', 'releases/latest']) {
    assert.ok(t.includes(s), `brak: ${s}`);
  }
});

test('ZMIANY.md ma wpis dla wersji z tauri.conf.json', () => {
  const { version } = JSON.parse(czytaj('src-tauri/tauri.conf.json'));
  assert.match(czytaj('ZMIANY.md').replace(/\r\n/g, '\n'), new RegExp(`^## ${version.replaceAll('.', '\\.')}\\n- `, 'm'));
});

test('.gitignore nie wpuszcza kluczy ani notatek planu', () => {
  const g = czytaj('.gitignore');
  for (const s of ['*.key', 'node_modules/', 'dist/', 'src-tauri/target/', '.robocze/', 'zlecenia/']) {
    assert.ok(g.includes(s), `brak: ${s}`);
  }
});
