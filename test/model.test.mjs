// Testy modelu celownika: wartosci domyslne, przycinanie zakresow, odporne wczytywanie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waliduj, DOMYSLNY, ZAKRESY, KSZTALTY } from '../ui/src/model.ts';

test('domyslny celownik to maly zielony okrag z kropka', () => {
  assert.equal(DOMYSLNY.ksztalt, 'okrag');
  assert.equal(DOMYSLNY.kolor, '#3BE04A');
  assert.equal(DOMYSLNY.kropka.wlaczona, true);
  assert.ok(DOMYSLNY.dlugosc <= 10, 'maly');
});

test('waliduj(domyslny) zwraca to samo', () => {
  assert.deepEqual(waliduj(DOMYSLNY), { ...DOMYSLNY, kropka: { ...DOMYSLNY.kropka }, obrys: { ...DOMYSLNY.obrys } });
});

test('smieci daja wartosci domyslne, bez wyjatku', () => {
  for (const w of [null, undefined, 42, 'abc', [], true, { ksztalt: 'gwiazda' }]) {
    const c = waliduj(w);
    assert.equal(c.kolor, DOMYSLNY.kolor);
    assert.ok(KSZTALTY.includes(c.ksztalt));
  }
});

test('liczby spoza zakresu sa przycinane', () => {
  const c = waliduj({
    dlugosc: 9999, grubosc: -5, przerwa: 1000, krycie: 7,
    kropka: { rozmiar: 0 }, obrys: { grubosc: 99 }, przesuniecieX: -5000, przesuniecieY: 5000,
  });
  assert.equal(c.dlugosc, ZAKRESY.dlugosc[1]);
  assert.equal(c.grubosc, ZAKRESY.grubosc[0]);
  assert.equal(c.przerwa, ZAKRESY.przerwa[1]);
  assert.equal(c.krycie, 1);
  assert.equal(c.kropka.rozmiar, ZAKRESY.kropkaRozmiar[0]);
  assert.equal(c.obrys.grubosc, ZAKRESY.obrysGrubosc[1]);
  assert.equal(c.przesuniecieX, ZAKRESY.przesuniecie[0]);
  assert.equal(c.przesuniecieY, ZAKRESY.przesuniecie[1]);
});

test('liczby sa zaokraglane do calych pikseli, krycie do setnych', () => {
  const c = waliduj({ dlugosc: 4.6, grubosc: 2.4, krycie: 0.555 });
  assert.equal(c.dlugosc, 5);
  assert.equal(c.grubosc, 2);
  assert.equal(c.krycie, 0.56);
});

test('null, napis i true nie udaja liczb', () => {
  const c = waliduj({ dlugosc: null, grubosc: '3', przerwa: true, krycie: NaN });
  assert.equal(c.dlugosc, DOMYSLNY.dlugosc);
  assert.equal(c.grubosc, DOMYSLNY.grubosc);
  assert.equal(c.przerwa, DOMYSLNY.przerwa);
  assert.equal(c.krycie, DOMYSLNY.krycie);
});

test('kolor tylko jako #RRGGBB', () => {
  assert.equal(waliduj({ kolor: '#ff00aa' }).kolor, '#FF00AA');
  assert.equal(waliduj({ kolor: 'red' }).kolor, DOMYSLNY.kolor);
  assert.equal(waliduj({ kolor: '#fff' }).kolor, DOMYSLNY.kolor);
  assert.equal(waliduj({ obrys: { kolor: 'url(x)' } }).obrys.kolor, DOMYSLNY.obrys.kolor);
});

test('kazdy ksztalt przechodzi walidacje', () => {
  for (const k of KSZTALTY) assert.equal(waliduj({ ksztalt: k }).ksztalt, k);
});
