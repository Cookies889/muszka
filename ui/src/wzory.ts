// Wbudowane celowniki na start. Stoja na poczatku listy zapisanych, nie da sie ich usunac ani przemianowac.

import { DOMYSLNY, waliduj, type Celownik } from './model.ts';

export interface Wzor {
  nazwa: string;
  celownik: Celownik;
}

export const WZORY: readonly Wzor[] = Object.freeze([
  { nazwa: 'Okrąg z kropką', celownik: waliduj(DOMYSLNY) },
  {
    nazwa: 'Kropka',
    celownik: waliduj({ ...DOMYSLNY, ksztalt: 'kropka', kropka: { wlaczona: true, rozmiar: 4 }, kolor: '#00FFFF' }),
  },
  {
    nazwa: 'Mały krzyż',
    celownik: waliduj({ ...DOMYSLNY, ksztalt: 'krzyz', dlugosc: 5, grubosc: 2, przerwa: 2, kropka: { wlaczona: false, rozmiar: 2 } }),
  },
  {
    nazwa: 'Klasyczny z przerwą',
    celownik: waliduj({
      ...DOMYSLNY,
      ksztalt: 'krzyz',
      dlugosc: 9,
      grubosc: 2,
      przerwa: 4,
      kropka: { wlaczona: false, rozmiar: 2 },
      obrys: { wlaczony: true, grubosc: 1, kolor: '#000000' },
      kolor: '#FFFF00',
    }),
  },
]);

/** Ten sam celownik po walidacji (porownanie do zaznaczenia na liscie). */
export function takiSam(a: unknown, b: unknown): boolean {
  return JSON.stringify(waliduj(a)) === JSON.stringify(waliduj(b));
}
