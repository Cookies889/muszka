// Testy rysowania: poprawny SVG dla kazdego ksztaltu, ostre piksele i dokladny srodek ekranu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rysuj, geometria } from '../ui/src/rysuj.ts';
import { DOMYSLNY, KSZTALTY, waliduj } from '../ui/src/model.ts';

const FHD = { szerokosc: 1920, wysokosc: 1080 };
const cel = (zmiany) => waliduj({ ...DOMYSLNY, ...zmiany });

/** Prosty sprawdzian skladni: jeden korzen svg, kazdy znacznik zamkniety. */
function poprawnySvg(s) {
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^>]*>.*<\/svg>$/s);
  const stos = [];
  for (const [, zamyka, nazwa, samo] of s.matchAll(/<(\/?)([a-z]+)[^>]*?(\/?)>/g)) {
    if (samo) continue;
    if (zamyka) assert.equal(stos.pop(), nazwa, `zle zamkniety <${nazwa}>`);
    else stos.push(nazwa);
  }
  assert.equal(stos.length, 0);
  assert.doesNotMatch(s, /NaN|undefined|Infinity/);
}

/** Srodek masy prostokatow (kazdy piksel liczony raz wazony powierzchnia). */
function srodek(prost) {
  let sx = 0, sy = 0, p = 0;
  for (const r of prost) { const a = r.w * r.h; sx += (r.x + r.w / 2) * a; sy += (r.y + r.h / 2) * a; p += a; }
  return [sx / p, sy / p];
}

test('kazdy ksztalt daje poprawny SVG z czyms do narysowania', () => {
  for (const k of KSZTALTY) {
    for (const obrys of [false, true]) {
      const s = rysuj(cel({ ksztalt: k, obrys: { wlaczony: obrys, grubosc: 1, kolor: '#000000' } }), FHD);
      poprawnySvg(s);
      assert.match(s, /<rect |<circle /, `${k} nic nie rysuje`);
    }
  }
});

test('domyslny: okrag i kropka, zielony', () => {
  const s = rysuj(DOMYSLNY, FHD);
  assert.match(s, /<circle [^>]*stroke="#3BE04A"/);
  assert.match(s, /<g fill="#3BE04A"><rect /);
});

test('viewBox w pikselach fizycznych, rozmiar w CSS', () => {
  const s = rysuj(DOMYSLNY, { szerokosc: 1536, wysokosc: 864, dpr: 1.25 });
  assert.match(s, /width="1536" height="864" viewBox="0 0 1920 1080"/);
  assert.match(s, /shape-rendering="crispEdges"/);
});

test('wspolrzedne prostokatow sa calkowite (ostre piksele)', () => {
  for (const k of KSZTALTY) for (const t of [1, 2, 3, 4]) for (const ekr of [FHD, { szerokosc: 1366, wysokosc: 768, dpr: 1.5 }]) {
    const g = geometria(cel({ ksztalt: k, grubosc: t, dlugosc: 9, przerwa: 3 }), ekr);
    for (const r of g.prostokaty) for (const v of [r.x, r.y, r.w, r.h]) assert.ok(Number.isInteger(v), `${k} t=${t}: ${v}`);
  }
});

test('parzysta grubosc na parzystym ekranie: srodek dokladnie na srodku', () => {
  for (const k of ['krzyz', 'krzyz-kropka', 'kropka']) {
    const g = geometria(cel({ ksztalt: k, grubosc: 2, kropka: { wlaczona: true, rozmiar: 2 } }), FHD);
    assert.deepEqual(srodek(g.prostokaty), [960, 540], k);
  }
  const ok = geometria(DOMYSLNY, FHD);
  assert.equal(ok.pierscien.cx, 960);
  assert.equal(ok.pierscien.cy, 540);
});

test('nieparzysta grubosc: najwyzej pol piksela od srodka, zawsze w te sama strone', () => {
  const g = geometria(cel({ ksztalt: 'krzyz', grubosc: 1, kropka: { wlaczona: false, rozmiar: 1 } }), FHD);
  assert.deepEqual(srodek(g.prostokaty), [960.5, 540.5]);
  // Nieparzysty ekran: tu dokladnie na srodku wypada wlasnie kreska nieparzysta.
  const n = geometria(cel({ ksztalt: 'krzyz', grubosc: 1, kropka: { wlaczona: false, rozmiar: 1 } }), { szerokosc: 1365, wysokosc: 767 });
  assert.deepEqual(srodek(n.prostokaty), [682.5, 383.5]);
});

test('ramiona symetryczne: rowna dlugosc i przerwa z kazdej strony', () => {
  const g = geometria(cel({ ksztalt: 'krzyz', grubosc: 2, dlugosc: 8, przerwa: 4, kropka: { wlaczona: false, rozmiar: 1 } }), FHD);
  assert.equal(g.prostokaty.length, 4);
  const [lewe, prawe, dolne, gorne] = g.prostokaty;
  assert.deepEqual(lewe, { x: 959 - 4 - 8, y: 539, w: 8, h: 2 });
  assert.equal(960 - (lewe.x + lewe.w), prawe.x - 960);
  assert.equal(540 - (gorne.y + gorne.h), dolne.y - 540);
});

test('T nie ma gornego ramienia', () => {
  const g = geometria(cel({ ksztalt: 't', kropka: { wlaczona: false, rozmiar: 1 } }), FHD);
  assert.equal(g.prostokaty.length, 3);
  // Nic nie wystaje nad poziome ramiona (gorna krawedz 539 przy grubosci 2).
  assert.ok(g.prostokaty.every((r) => r.y >= 539));
});

test('przesuniecie przesuwa caly celownik o tyle pikseli', () => {
  const a = geometria(cel({ ksztalt: 'krzyz' }), FHD);
  const b = geometria(cel({ ksztalt: 'krzyz', przesuniecieX: 5, przesuniecieY: -3 }), FHD);
  const [ax, ay] = srodek(a.prostokaty);
  assert.deepEqual(srodek(b.prostokaty), [ax + 5, ay - 3]);
});

test('obrys rysuje sie pod wypelnieniem i jest szerszy', () => {
  const s = rysuj(cel({ ksztalt: 'kropka', kropka: { wlaczona: true, rozmiar: 2 }, obrys: { wlaczony: true, grubosc: 1, kolor: '#000000' } }), FHD);
  assert.ok(s.indexOf('fill="#000000"') < s.indexOf('fill="#3BE04A"'));
  assert.match(s, /<g fill="#000000"><rect x="958" y="538" width="4" height="4"\/>/);
  assert.match(s, /<g fill="#3BE04A"><rect x="959" y="539" width="2" height="2"\/>/);
});

test('krycie trafia do grupy', () => {
  assert.match(rysuj(cel({ krycie: 0.4 }), FHD), /<g opacity="0.4">/);
});
