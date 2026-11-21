// Model celownika: typ, wartosci domyslne i walidacja z przycinaniem zakresow.
// Wszystkie wymiary sa w pikselach MONITORA (fizycznych), jak w ustawieniach celownika w CS2.
// Ten sam model czyta nakladka, edytor i (po stronie Rusta) plik ustawien, gdzie lezy jako zwykly JSON.

export const KSZTALTY = ['krzyz', 'kropka', 'okrag', 'krzyz-kropka', 't'] as const;
export type Ksztalt = (typeof KSZTALTY)[number];

export const NAZWY_KSZTALTOW: Record<Ksztalt, string> = {
  krzyz: 'Krzyż',
  kropka: 'Kropka',
  okrag: 'Okrąg',
  'krzyz-kropka': 'Krzyż z kropką',
  t: 'T (bez górnego ramienia)',
};

export interface Celownik {
  ksztalt: Ksztalt;
  /** Dlugosc ramienia krzyza; dla okregu promien zewnetrzny. */
  dlugosc: number;
  /** Grubosc ramion i pierscienia okregu. */
  grubosc: number;
  /** Odstep ramion od srodka (krzyz, T). */
  przerwa: number;
  kropka: { wlaczona: boolean; rozmiar: number };
  obrys: { wlaczony: boolean; grubosc: number; kolor: string };
  kolor: string;
  /** 0 (niewidoczny) do 1 (pelny). */
  krycie: number;
  przesuniecieX: number;
  przesuniecieY: number;
}

/** Zakresy liczb: [min, max]. Wartosc spoza zakresu jest przycinana, nie odrzucana. */
export const ZAKRESY = {
  dlugosc: [0, 60],
  grubosc: [1, 12],
  przerwa: [0, 40],
  kropkaRozmiar: [1, 12],
  obrysGrubosc: [1, 4],
  krycie: [0, 1],
  przesuniecie: [-300, 300],
} as const satisfies Record<string, readonly [number, number]>;

/** Domyslny celownik: maly zielony okrag z kropka w srodku. */
export const DOMYSLNY: Celownik = Object.freeze({
  ksztalt: 'okrag',
  dlugosc: 7,
  grubosc: 2,
  przerwa: 3,
  kropka: Object.freeze({ wlaczona: true, rozmiar: 2 }),
  obrys: Object.freeze({ wlaczony: false, grubosc: 1, kolor: '#000000' }),
  kolor: '#3BE04A',
  krycie: 1,
  przesuniecieX: 0,
  przesuniecieY: 0,
}) as Celownik;

const KOLOR = /^#[0-9a-f]{6}$/i;

function liczba(v: unknown, [min, max]: readonly [number, number], dom: number, calkowita = true): number {
  // Najpierw typ: Number(null), Number('') i Number(true) udawalyby poprawne liczby.
  if (typeof v !== 'number' || !Number.isFinite(v)) return dom;
  const x = calkowita ? Math.round(v) : v;
  return Math.min(max, Math.max(min, x));
}

function kolor(v: unknown, dom: string): string {
  return typeof v === 'string' && KOLOR.test(v) ? v.toUpperCase() : dom;
}

function prawda(v: unknown, dom: boolean): boolean {
  return typeof v === 'boolean' ? v : dom;
}

function obiekt(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Z czegokolwiek (zapis z pliku, zdarzenie, pole formularza) robi poprawny celownik.
 * Brakujace albo zepsute pola dostaja wartosci domyslne, liczby sa przycinane do ZAKRESY.
 */
export function waliduj(wejscie: unknown): Celownik {
  const w = obiekt(wejscie);
  const k = obiekt(w.kropka);
  const o = obiekt(w.obrys);
  const d = DOMYSLNY;
  return {
    ksztalt: KSZTALTY.includes(w.ksztalt as Ksztalt) ? (w.ksztalt as Ksztalt) : d.ksztalt,
    dlugosc: liczba(w.dlugosc, ZAKRESY.dlugosc, d.dlugosc),
    grubosc: liczba(w.grubosc, ZAKRESY.grubosc, d.grubosc),
    przerwa: liczba(w.przerwa, ZAKRESY.przerwa, d.przerwa),
    kropka: {
      wlaczona: prawda(k.wlaczona, d.kropka.wlaczona),
      rozmiar: liczba(k.rozmiar, ZAKRESY.kropkaRozmiar, d.kropka.rozmiar),
    },
    obrys: {
      wlaczony: prawda(o.wlaczony, d.obrys.wlaczony),
      grubosc: liczba(o.grubosc, ZAKRESY.obrysGrubosc, d.obrys.grubosc),
      kolor: kolor(o.kolor, d.obrys.kolor),
    },
    kolor: kolor(w.kolor, d.kolor),
    krycie: Math.round(liczba(w.krycie, ZAKRESY.krycie, d.krycie, false) * 100) / 100,
    przesuniecieX: liczba(w.przesuniecieX, ZAKRESY.przesuniecie, d.przesuniecieX),
    przesuniecieY: liczba(w.przesuniecieY, ZAKRESY.przesuniecie, d.przesuniecieY),
  };
}
