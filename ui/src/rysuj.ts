// Rysowanie celownika: czysta funkcja model -> napis SVG. Uzywa jej nakladka i podglad w edytorze.
//
// Ostre piksele: SVG ma viewBox w pikselach FIZYCZNYCH (rozmiar CSS razy devicePixelRatio), a kazdy
// prostokat ma calkowite wspolrzedne w tym ukladzie, wiec krawedzie trafiaja w granice pikseli monitora.
//
// Srodek: przy parzystej szerokosci srodek monitora lezy na granicy pikseli W/2 - 1 i W/2. Kreska o
// parzystej grubosci (2, 4) siedzi wtedy dokladnie na srodku. Kreska o grubosci nieparzystej nie moze
// (pol piksela nie istnieje), wiec zajmuje piksel W/2, czyli pol piksela w prawo i w dol. Przy
// nieparzystej szerokosci jest odwrotnie: dokladnie na srodku wypada kreska nieparzysta.

import { waliduj, type Celownik } from './model.ts';

export interface Ekran {
  /** Szerokosc obszaru rysowania w px CSS (okno nakladki albo pole podgladu). */
  szerokosc: number;
  /** Wysokosc obszaru rysowania w px CSS. */
  wysokosc: number;
  /** window.devicePixelRatio; domyslnie 1. */
  dpr?: number;
}

export interface Prostokat {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pierscien {
  cx: number;
  cy: number;
  /** Promien srodka linii. */
  r: number;
  grubosc: number;
}

export interface Geometria {
  /** Rozmiar w pikselach fizycznych (viewBox). */
  W: number;
  H: number;
  prostokaty: Prostokat[];
  pierscien: Pierscien | null;
}

/** Odcinek o grubosci t wokol granicy c: [poczatek, poczatek + t). */
function odcinek(c: number, t: number): [number, number] {
  const s = c - Math.floor(t / 2);
  return [s, s + t];
}

/** Ksztalty celownika w pikselach fizycznych, bez kolorow. */
export function geometria(wejscie: Celownik, ekran: Ekran): Geometria {
  const c = waliduj(wejscie);
  const dpr = ekran.dpr && ekran.dpr > 0 ? ekran.dpr : 1;
  const W = Math.max(1, Math.round(ekran.szerokosc * dpr));
  const H = Math.max(1, Math.round(ekran.wysokosc * dpr));
  // Granica pikseli najblizsza srodkowi, plus przesuniecie z ustawien.
  const Cx = Math.floor(W / 2) + c.przesuniecieX;
  const Cy = Math.floor(H / 2) + c.przesuniecieY;

  const prostokaty: Prostokat[] = [];
  let pierscien: Pierscien | null = null;
  const dodaj = (x0: number, y0: number, x1: number, y1: number) => {
    if (x1 > x0 && y1 > y0) prostokaty.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  };

  const { dlugosc: d, grubosc: t, przerwa: p } = c;
  const ramiona = c.ksztalt === 'krzyz' || c.ksztalt === 'krzyz-kropka' || c.ksztalt === 't';
  const kropka =
    c.ksztalt === 'kropka' || c.ksztalt === 'krzyz-kropka' || c.kropka.wlaczona;

  if (ramiona && d > 0) {
    const [sx, ex] = odcinek(Cx, t);
    const [sy, ey] = odcinek(Cy, t);
    dodaj(sx - p - d, sy, sx - p, ey); // lewe
    dodaj(ex + p, sy, ex + p + d, ey); // prawe
    dodaj(sx, ey + p, ex, ey + p + d); // dolne
    if (c.ksztalt !== 't') dodaj(sx, sy - p - d, ex, sy - p); // gorne
    // Przerwa 0 = ramiona sie stykaja, wiec srodek tez jest pelny.
    if (p === 0) dodaj(sx, sy, ex, ey);
  }

  let srodekX = W / 2 + c.przesuniecieX;
  let srodekY = H / 2 + c.przesuniecieY;
  if (kropka) {
    const k = c.kropka.rozmiar;
    const [sx, ex] = odcinek(Cx, k);
    const [sy, ey] = odcinek(Cy, k);
    dodaj(sx, sy, ex, ey);
    // Okrag wokol kropki ma ten sam srodek co kropka, inaczej przy nieparzystej kropce wyglada krzywo.
    srodekX = (sx + ex) / 2;
    srodekY = (sy + ey) / 2;
  }

  if (c.ksztalt === 'okrag' && d > 0) {
    // dlugosc = promien zewnetrzny; linia nie moze byc grubsza niz promien.
    const g = Math.min(t, d);
    pierscien = { cx: srodekX, cy: srodekY, r: d - g / 2, grubosc: g };
  }

  return { W, H, prostokaty, pierscien };
}

const liczbaSvg = (n: number) => String(Math.round(n * 1000) / 1000);

/** Celownik jako samodzielny napis SVG o rozmiarze CSS ekranu. */
export function rysuj(wejscie: unknown, ekran: Ekran): string {
  const c = waliduj(wejscie);
  const g = geometria(c, ekran);
  const o = c.obrys.wlaczony ? c.obrys.grubosc : 0;

  const prost = (r: Prostokat, w: number) =>
    `<rect x="${r.x - w}" y="${r.y - w}" width="${r.w + 2 * w}" height="${r.h + 2 * w}"/>`;
  const kolo = (pr: Pierscien, kolor: string, w: number) =>
    `<circle cx="${liczbaSvg(pr.cx)}" cy="${liczbaSvg(pr.cy)}" r="${liczbaSvg(pr.r)}" fill="none" ` +
    `stroke="${kolor}" stroke-width="${pr.grubosc + 2 * w}" shape-rendering="geometricPrecision"/>`;

  const warstwy: string[] = [];
  // Najpierw caly obrys, potem cale wypelnienie: obrys jednego ramienia nie wchodzi na drugie.
  if (o > 0) {
    if (g.pierscien) warstwy.push(kolo(g.pierscien, c.obrys.kolor, o));
    if (g.prostokaty.length) warstwy.push(`<g fill="${c.obrys.kolor}">${g.prostokaty.map((r) => prost(r, o)).join('')}</g>`);
  }
  if (g.pierscien) warstwy.push(kolo(g.pierscien, c.kolor, 0));
  if (g.prostokaty.length) warstwy.push(`<g fill="${c.kolor}">${g.prostokaty.map((r) => prost(r, 0)).join('')}</g>`);

  const sz = liczbaSvg(ekran.szerokosc);
  const wy = liczbaSvg(ekran.wysokosc);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${wy}" viewBox="0 0 ${g.W} ${g.H}" ` +
    `shape-rendering="crispEdges" aria-hidden="true"><g opacity="${c.krycie}">${warstwy.join('')}</g></svg>`
  );
}
