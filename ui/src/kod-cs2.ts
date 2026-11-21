// Kod celownika z CS2 (Ustawienia gry > Celownik > Udostępnij) na model Muszki.
//
// Format jest publicznie opisany (biblioteka csgo-sharecode, MIT). Kod to jedna duza liczba zapisana
// w systemie o podstawie 57 (alfabet SLOWNIK), cyfra najmniej znaczaca pierwsza. Liczba rozpisana na
// bajty (najstarszy pierwszy): bajt 0 to suma kontrolna (suma reszty bajtow modulo 256), bajt 1 to wersja.
//
// Dwa opakowania:
//   CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX  25 znakow, 18 bajtow, wersje 1, 3 i 4,
//   CS + 44 znaki bez myslnikow          32 bajty, wersja 1 (CS2 od aktualizacji z 30.09.2026).
//
// Jednostki: wersja 1 starego opakowania trzyma rozmiary w dziesiatych czesciach jednostek gry
// (jak cl_crosshairsize), nowsze wersje trzymaja piksele narysowane przy wysokosci ekranu
// `screenHeight`. Muszka rysuje w pikselach monitora, wiec przeliczamy na wysokosc docelowa
// (domyslnie 1080). Dla wersji 1 bierzemy przelicznik gry z CS:GO: jednostka = wysokosc / 480 px.

import { waliduj, type Celownik, type Ksztalt } from './model.ts';

export const SLOWNIK = 'ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789';

const STARY = new RegExp(`^CSGO(-?[${SLOWNIK}]{5}){5}$`);
const NOWY = new RegExp(`^CS[${SLOWNIK}]{44}$`);

/** Pola odczytane z kodu, wspolne dla wszystkich wersji (bez rozdzielania kresek, ktorych Muszka nie rysuje). */
export interface Surowe {
  format: 'legacy-v1' | 'legacy-v3' | 'legacy-v4' | 'cs2-v1';
  /** Wysokosc ekranu, przy ktorej zapisano rozmiary; null w wersji 1 (jednostki gry). */
  wysokosc: number | null;
  dlugosc: number;
  grubosc: number;
  przerwa: number;
  kropka: boolean;
  styT: boolean;
  obrys: boolean;
  /** Grubosc obrysu w wersji 1 (0,5 do 3); w nowszych wersjach gra nie zapisuje grubosci. */
  obrysGrubosc: number | null;
  obrysRgb: [number, number, number] | null;
  rgb: [number, number, number];
  alfa: number;
}

export type WynikKodu =
  | { ok: true; celownik: Celownik; surowe: Surowe }
  | { ok: false; blad: string };

const BLAD_FORMATU =
  'To nie jest kod celownika z CS2. Kod z gry zaczyna się od „CSGO-” albo od „CS” i ma 44 znaki po nim. ' +
  'Kodów z Crosshair X i innych programów Muszka nie czyta.';
const BLAD_SUMY = 'Kod ma literówkę albo jest niepełny (suma kontrolna się nie zgadza). Skopiuj go z gry jeszcze raz.';
const BLAD_WERSJI = 'Tej wersji kodu Muszka jeszcze nie zna. Zaktualizuj Muszkę albo ustaw celownik ręcznie.';

class BladKodu extends Error {}

/** Znaki kodu (bez przedrostka) na bajty, najstarszy bajt pierwszy. */
export function bajtyZeZnakow(znaki: string, ileBajtow: number): number[] {
  let liczba = 0n;
  for (const z of Array.from(znaki).reverse()) {
    const i = SLOWNIK.indexOf(z);
    if (i < 0) throw new BladKodu(BLAD_FORMATU);
    liczba = liczba * 57n + BigInt(i);
  }
  const hex = liczba.toString(16).padStart(ileBajtow * 2, '0');
  // Liczba za duza na dlugosc kodu = to nie jest kod celownika.
  if (hex.length > ileBajtow * 2) throw new BladKodu(BLAD_SUMY);
  const bajty: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bajty.push(parseInt(hex.slice(i, i + 2), 16));
  return bajty;
}

function sprawdzSume(b: number[]) {
  const suma = b.slice(1).reduce((a, x) => a + x, 0) % 256;
  if (b[0] !== suma) throw new BladKodu(BLAD_SUMY);
}

const int8 = (n: number) => (n << 24) >> 24;
const int16 = (n: number) => (n << 16) >> 16;

/** Kolory 0 do 4 z cl_crosshaircolor; 5 = wlasny RGB. */
const KOLORY_GRY: [number, number, number][] = [
  [250, 50, 50],
  [50, 250, 50],
  [250, 250, 50],
  [50, 50, 250],
  [50, 250, 250],
];

function wersja1(b: number[]): Surowe {
  const kolor = b[10] & 7;
  const flagi = b[13] >> 4;
  const alfaWl = (flagi & 4) === 4;
  return {
    format: 'legacy-v1',
    wysokosc: null,
    przerwa: int8(b[2]) / 10,
    obrysGrubosc: b[3] / 2,
    rgb: kolor === 5 ? [b[4], b[5], b[6]] : KOLORY_GRY[kolor] ?? [b[4], b[5], b[6]],
    // Bez cl_crosshairusealpha gra rysowala celownik z alfa 200.
    alfa: alfaWl ? b[7] : 200,
    obrys: (b[10] & 8) === 8,
    grubosc: b[12] / 10,
    kropka: (flagi & 1) === 1,
    styT: (flagi & 8) === 8,
    dlugosc: b[14] / 10,
    obrysRgb: null,
  };
}

/** Wspolny uklad wersji 3 i 4 (piksele przy wysokosci ekranu). */
function wersja3i4(b: number[], v: 3 | 4): Surowe {
  const pola = b[10] | (b[11] << 8) | (b[12] << 16) | (b[13] << 24);
  return {
    format: v === 3 ? 'legacy-v3' : 'legacy-v4',
    wysokosc: Math.max(240, b[14] | (b[15] << 8)),
    kropka: (b[2] & 0x40) === 0x40,
    styT: (b[2] & 0x80) === 0x80,
    obrys: v === 3 ? (b[2] & 0x20) === 0x20 : ((b[13] >> 4) & 3) > 0,
    obrysGrubosc: null,
    obrysRgb: null,
    rgb: [b[3], b[4], b[5]],
    alfa: b[6],
    przerwa: b[7],
    dlugosc: b[8],
    grubosc: (pola >> 23) & 0x1f,
  };
}

function cs2(b: number[]): Surowe {
  const wysokosc = b[2] | (b[3] << 8);
  if (wysokosc === 0) throw new BladKodu(BLAD_SUMY);
  return {
    format: 'cs2-v1',
    wysokosc: Math.max(240, wysokosc),
    kropka: (b[4] & 0x40) === 0x40,
    styT: (b[4] & 0x80) === 0x80,
    obrys: Math.min(b[13] >>> 6, 2) > 0,
    obrysGrubosc: null,
    rgb: [b[5], b[6], b[7]],
    alfa: b[8],
    obrysRgb: [b[9], b[10], b[11]],
    przerwa: Math.min(3840, Math.max(-3840, int16(b[14] | (b[15] << 8)))),
    dlugosc: b[16],
    grubosc: Math.min(b[13] & 0x3f, 32),
  };
}

/** Sam odczyt pol z kodu. Rzuca BladKodu z komunikatem dla czlowieka. */
export function odczytaj(kod: string): Surowe {
  const k = kod.replace(/\s+/g, '');
  if (STARY.test(k)) {
    const b = bajtyZeZnakow(k.slice(4).replace(/-/g, ''), 18);
    sprawdzSume(b);
    if (b[1] === 1) return wersja1(b);
    if (b[1] === 3 || b[1] === 4) return wersja3i4(b, b[1]);
    throw new BladKodu(BLAD_WERSJI);
  }
  if (NOWY.test(k)) {
    const b = bajtyZeZnakow(k.slice(2), 32);
    sprawdzSume(b);
    if (b[1] === 1) return cs2(b);
    throw new BladKodu(BLAD_WERSJI);
  }
  throw new BladKodu(BLAD_FORMATU);
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');
const naHex = ([r, g, b]: [number, number, number]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();

/** Pola z kodu na model Muszki, w pikselach monitora o wysokosci `wysokoscEkranu`. */
export function naCelownik(s: Surowe, wysokoscEkranu = 1080): Celownik {
  // Wersja 1: jednostki gry (wysokosc / 480 px). Nowsze: piksele przy s.wysokosc.
  const skala = s.wysokosc === null ? wysokoscEkranu / 480 : wysokoscEkranu / s.wysokosc;
  const px = (x: number) => Math.round(x * skala);
  const dlugosc = px(s.dlugosc);
  const grubosc = Math.max(1, px(s.grubosc));
  // W wersji 1 przerwa 0 nie oznaczala stykajacych sie ramion: ramiona stykaly sie przy okolo -4.
  const przerwa = Math.max(0, s.wysokosc === null ? px(s.przerwa + 4) : px(s.przerwa));

  let ksztalt: Ksztalt = 'krzyz';
  if (s.styT) ksztalt = 't';
  else if (dlugosc === 0 && s.kropka) ksztalt = 'kropka';
  else if (s.kropka) ksztalt = 'krzyz-kropka';

  return waliduj({
    ksztalt,
    dlugosc,
    grubosc,
    przerwa,
    // Kropka w grze ma bok rowny grubosci kreski.
    kropka: { wlaczona: s.kropka, rozmiar: grubosc },
    obrys: {
      wlaczony: s.obrys,
      grubosc: s.obrysGrubosc === null ? 1 : Math.max(1, Math.round(s.obrysGrubosc)),
      kolor: s.obrysRgb ? naHex(s.obrysRgb) : '#000000',
    },
    kolor: naHex(s.rgb),
    krycie: Math.round((s.alfa / 255) * 100) / 100,
    przesuniecieX: 0,
    przesuniecieY: 0,
  });
}

/** Kod z gry na celownik Muszki albo komunikat, czemu sie nie da. */
export function czytajKod(kod: string, wysokoscEkranu = 1080): WynikKodu {
  if (!kod.trim()) return { ok: false, blad: 'Wklej kod z CS2.' };
  try {
    const surowe = odczytaj(kod);
    return { ok: true, surowe, celownik: naCelownik(surowe, wysokoscEkranu) };
  } catch (e) {
    if (e instanceof BladKodu) return { ok: false, blad: e.message };
    throw e;
  }
}
