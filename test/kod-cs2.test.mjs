// Kod celownika z CS2. Wartosci oczekiwane pochodza z testow biblioteki csgo-sharecode (akiver, MIT),
// ktore autor sprawdzil na zmiennych cl_* zapisanych przez gre, a nie z naszego kodu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { odczytaj, czytajKod, naCelownik } from '../ui/src/kod-cs2.ts';

const PRZYPADKI = [
  {
    kod: 'CSGO-Cn37R-YE7vo-pLCAL-aURmZ-z6zkG',
    oczekiwane: { format: 'legacy-v1', przerwa: -1.3, obrysGrubosc: 2, rgb: [175, 81, 213], alfa: 137, obrys: true, grubosc: 1.2, kropka: true, styT: true, dlugosc: 4.6 },
  },
  {
    // Kolor 1 (zielony z gry), alfa wylaczona: gra rysuje z alfa 200.
    kod: 'CSGO-LibdP-VCVEd-ESayK-rSivi-2UBtG',
    oczekiwane: { format: 'legacy-v1', przerwa: 1, obrysGrubosc: 1, rgb: [50, 250, 50], alfa: 200, obrys: false, grubosc: 0.5, kropka: false, styT: false, dlugosc: 5 },
  },
  {
    kod: 'CSGO-p4NqQ-mV2es-p2UF3-Q9HWe-fVmoE',
    oczekiwane: { format: 'legacy-v3', wysokosc: 1080, rgb: [0, 255, 0], alfa: 255, przerwa: 4, dlugosc: 8, grubosc: 1, obrys: true, kropka: false, styT: false },
  },
  {
    kod: 'CSGO-MnUCC-89iG7-2cVar-wy7Yn-amCpF',
    oczekiwane: { format: 'legacy-v3', wysokosc: 1080, rgb: [252, 15, 192], alfa: 255, przerwa: 4, dlugosc: 8, grubosc: 3, obrys: true, kropka: true, styT: false },
  },
  {
    kod: 'CSGO-G8oAC-RyvWc-Hi3CZ-voSwn-QJbfE',
    oczekiwane: { format: 'legacy-v4', wysokosc: 768, rgb: [124, 57, 57], alfa: 255, przerwa: 25, dlugosc: 7, grubosc: 20, obrys: true, kropka: true, styT: false },
  },
  {
    kod: 'CSvbPubOq37zTGqtsPTP5QTrp5CB4xFXiKRLfzJsm49ZRe',
    oczekiwane: { format: 'cs2-v1', wysokosc: 768, rgb: [255, 0, 0], alfa: 255, obrysRgb: [0, 0, 0], przerwa: 0, dlugosc: 5, grubosc: 1, obrys: false, kropka: true, styT: false },
  },
  {
    // Kod zlozony recznie przez autora biblioteki: kazde pole inne niz domyslne.
    kod: 'CSAB6Oby2JUDOrBRy4jRcsR6JOQdhbszKF9GuKQGhKVwAc',
    oczekiwane: { format: 'cs2-v1', wysokosc: 1440, rgb: [10, 20, 30], alfa: 200, obrysRgb: [40, 50, 60], przerwa: -7, dlugosc: 255, grubosc: 12, obrys: true, kropka: false, styT: true },
  },
];

for (const { kod, oczekiwane } of PRZYPADKI) {
  test(`odczyt pol: ${kod}`, () => {
    const s = odczytaj(kod);
    for (const [pole, wartosc] of Object.entries(oczekiwane)) {
      assert.deepEqual(s[pole], wartosc, `pole ${pole}`);
    }
  });
}

test('kod wersji 3 przy 1080p przechodzi na model piksel w piksel', () => {
  const w = czytajKod('CSGO-p4NqQ-mV2es-p2UF3-Q9HWe-fVmoE');
  assert.equal(w.ok, true);
  assert.equal(w.celownik.ksztalt, 'krzyz');
  assert.equal(w.celownik.dlugosc, 8);
  assert.equal(w.celownik.grubosc, 1);
  assert.equal(w.celownik.przerwa, 4);
  assert.equal(w.celownik.kolor, '#00FF00');
  assert.equal(w.celownik.krycie, 1);
  assert.equal(w.celownik.obrys.wlaczony, true);
});

test('kod CS2 zapisany przy 768 px skaluje sie na wysokosc monitora', () => {
  const s = odczytaj('CSvbPubOq37zTGqtsPTP5QTrp5CB4xFXiKRLfzJsm49ZRe');
  const c1080 = naCelownik(s, 1080); // 5 * 1080/768 = 7,03
  assert.equal(c1080.ksztalt, 'krzyz-kropka');
  assert.equal(c1080.dlugosc, 7);
  assert.equal(c1080.grubosc, 1);
  assert.equal(c1080.kolor, '#FF0000');
  const c1440 = naCelownik(s, 1440); // 5 * 1440/768 = 9,375; 1 * 1,875 = 1,875
  assert.equal(c1440.dlugosc, 9);
  assert.equal(c1440.grubosc, 2);
  assert.equal(c1440.kropka.rozmiar, 2);
});

test('styl T, alfa i kolor obrysu z kodu CS2', () => {
  const w = czytajKod('CSAB6Oby2JUDOrBRy4jRcsR6JOQdhbszKF9GuKQGhKVwAc', 1440);
  assert.equal(w.ok, true);
  assert.equal(w.celownik.ksztalt, 't');
  assert.equal(w.celownik.kolor, '#0A141E');
  assert.equal(w.celownik.obrys.kolor, '#28323C');
  assert.equal(w.celownik.krycie, 0.78); // 200 / 255
  assert.equal(w.celownik.przerwa, 0); // ujemna przerwa = ramiona sie stykaja
  assert.equal(w.celownik.dlugosc, 60); // 255 px przyciete do zakresu Muszki
});

test('kod z odstepami i znakiem nowej linii tez przechodzi', () => {
  assert.equal(czytajKod('  CSGO-p4NqQ-mV2es-p2UF3-Q9HWe-fVmoE\n').ok, true);
});

test('zle kody daja komunikat zamiast wyjatku', () => {
  const zle = {
    '': /Wklej kod/,
    'CSGO-L9spZ-ihuov-cyhtE-kxbqa-FkBAA': /suma kontrolna/, // kod meczu, nie celownika
    'CSGO-eRqP8-AkrwM-3Wsqh-pKDTh-eAPtQ': /wersji/, // suma dobra, wersja 2 nie istnieje
    'CSkSCHQKunGr2yPsJr2U3RTd8ycMA2pEs9jWnxK5KjMmWL': /suma kontrolna/,
    'CSGO-p4NqQ-mV2es-p2UF3-Q9HWe': /nie jest kod celownika/,
    'CS1a2b3c4d': /Crosshair X/,
    'cl_crosshairsize 2': /Crosshair X/,
  };
  for (const [kod, wzor] of Object.entries(zle)) {
    const w = czytajKod(kod);
    assert.equal(w.ok, false, kod);
    assert.match(w.blad, wzor, kod);
  }
});
