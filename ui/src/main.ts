// Okno 'main': edytor celownika. Podglad 1:1 na tle z lupa, ustawienia, zapisane celowniki,
// kod z CS2 i pasek stanu nakladki (wlacznik, skrot, monitor, tylko CS2).
// Kazda zmiana celownika idzie od razu do nakladki, a na dysk ok. 300 ms po ostatniej zmianie.

import { backend, type Monitor, type Ustawienia } from './api.ts';
import { DOMYSLNY, KSZTALTY, NAZWY_KSZTALTOW, ZAKRESY, waliduj, type Celownik } from './model.ts';
import { rysuj } from './rysuj.ts';
import { czytajKod } from './kod-cs2.ts';
import { WZORY, takiSam } from './wzory.ts';
import { sledzAktualizacje } from './aktualizacje.ts';

const OPOZNIENIE_ZAPISU = 300;
const CZAS_COFNIECIA = 8000;
const LUPA = 4;

const TLA = [
  { id: 'mur', nazwa: 'Jasny mur' },
  { id: 'korytarz', nazwa: 'Ciemny korytarz' },
  { id: 'niebo', nazwa: 'Niebo' },
  { id: 'zielen', nazwa: 'Zieleń' },
] as const;

/** Gotowe kolory dobrze widoczne na mapach: zielen celownika, cyjan, zolty, magenta, czerwien, biel. */
const PROBKI = [
  { kolor: '#3BE04A', nazwa: 'Zielony' },
  { kolor: '#00FFFF', nazwa: 'Cyjan' },
  { kolor: '#FFFF00', nazwa: 'Żółty' },
  { kolor: '#FF00FF', nazwa: 'Magenta' },
  { kolor: '#FF3B3B', nazwa: 'Czerwony' },
  { kolor: '#FFFFFF', nazwa: 'Biały' },
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const api = await backend();
let u: Ustawienia = await api.wczytaj();
let c: Celownik = waliduj(u.celownik);
let monitory: Monitor[] = [];

// ---------- Komunikaty ----------

const bladOgolny = $<HTMLParagraphElement>('blad');
function pokazBlad(tekst: string | null) {
  bladOgolny.hidden = !tekst;
  bladOgolny.textContent = tekst ?? '';
}

// ---------- Podglad i lupa ----------

const podglad = $<HTMLDivElement>('podglad');
const rysunek = $<HTMLDivElement>('rysunek');
const lupa = $<HTMLDivElement>('lupa');
const lupaWl = $<HTMLInputElement>('lupa-wl');

function narysujPodglad() {
  const dpr = devicePixelRatio || 1;
  rysunek.innerHTML = rysuj(c, { szerokosc: rysunek.clientWidth, wysokosc: rysunek.clientHeight, dpr });
  lupa.hidden = !lupaWl.checked;
  if (lupaWl.checked) {
    // Ten sam celownik na polu 4 razy mniejszym, rozciagniety na cala lupe: piksel monitora = 4x4.
    const bok = lupa.clientWidth;
    const svg = rysuj(c, { szerokosc: bok / LUPA, wysokosc: bok / LUPA, dpr });
    lupa.innerHTML = svg.replace(/width="[^"]*" height="[^"]*"/, `width="${bok}" height="${bok}"`);
    lupa.style.setProperty('--piksel', `${LUPA / dpr}px`);
  }
}
new ResizeObserver(narysujPodglad).observe(rysunek);
lupaWl.addEventListener('change', narysujPodglad);

const tla = $<HTMLDivElement>('tla');
for (const t of TLA) {
  const l = document.createElement('label');
  l.className = 'segment';
  l.innerHTML = `<input type="radio" name="tlo" value="${t.id}"><span>${t.nazwa}</span>`;
  const r = l.querySelector('input')!;
  r.checked = t.id === (localStorage.getItem('muszka-tlo') ?? 'mur');
  if (r.checked) podglad.dataset.tlo = t.id;
  r.addEventListener('change', () => {
    podglad.dataset.tlo = t.id;
    localStorage.setItem('muszka-tlo', t.id);
  });
  tla.append(l);
}

// ---------- Zmiana celownika: nakladka od razu, dysk z opoznieniem ----------

let zegarZapisu: number | undefined;

function zmien(nowy: Partial<Celownik>) {
  c = waliduj({ ...c, ...nowy });
  u.celownik = c;
  odswiez();
  api.ustawCelownik(c, false).catch((e) => pokazBlad(`Nakładka nie dostała zmiany: ${e}`));
  clearTimeout(zegarZapisu);
  zegarZapisu = window.setTimeout(() => {
    api
      .ustawCelownik(c, true)
      .then(() => pokazBlad(null))
      .catch((e) => pokazBlad(`Nie zapisano celownika: ${e}. Po ponownym otwarciu wróci ostatni zapisany.`));
  }, OPOZNIENIE_ZAPISU);
}

// ---------- Ksztalt ----------

const ksztalty = $<HTMLDivElement>('ksztalty');
const miniKsztaltu = new Map<string, HTMLSpanElement>();
for (const k of KSZTALTY) {
  const l = document.createElement('label');
  l.className = 'ksztalt';
  l.innerHTML = `<input type="radio" name="ksztalt" value="${k}"><span class="mini" aria-hidden="true"></span><span>${NAZWY_KSZTALTOW[k].replace(' (bez górnego ramienia)', '')}</span>`;
  l.title = NAZWY_KSZTALTOW[k];
  l.querySelector('input')!.addEventListener('change', () => zmien({ ksztalt: k }));
  miniKsztaltu.set(k, l.querySelector('.mini')!);
  ksztalty.append(l);
}

// ---------- Kolor ----------

const probki = $<HTMLDivElement>('probki');
for (const p of PROBKI) {
  const l = document.createElement('label');
  l.className = 'probka';
  l.title = p.nazwa;
  l.style.setProperty('--probka', p.kolor);
  l.innerHTML = `<input type="radio" name="probka" value="${p.kolor}" aria-label="${p.nazwa}">`;
  l.querySelector('input')!.addEventListener('change', () => zmien({ kolor: p.kolor }));
  probki.append(l);
}
const kolor = $<HTMLInputElement>('kolor');
const kolorHex = $<HTMLSpanElement>('kolor-hex');
kolor.addEventListener('input', () => zmien({ kolor: kolor.value }));

// ---------- Wiersze z suwakiem i polem liczbowym ----------

interface Wiersz {
  odswiez(): void;
}
const wiersze: Wiersz[] = [];

let licznik = 0;
function suwak(
  rodzic: HTMLElement,
  opis: {
    etykieta: string;
    zakres: readonly [number, number];
    /** Zakres samego suwaka, gdy pole liczbowe przyjmuje wiecej (przesuniecie). */
    zakresSuwaka?: readonly [number, number];
    jednostka: string;
    czytaj: () => number;
    zapisz: (v: number) => void;
    nieczynny?: () => boolean;
    przelacznik?: { etykieta: string; czytaj: () => boolean; zapisz: (v: boolean) => void; nieczynny?: () => boolean };
    dodatek?: HTMLElement;
  },
) {
  const id = `w${++licznik}`;
  const w = document.createElement('div');
  w.className = 'wiersz';
  const [min, max] = opis.zakres;
  const [smin, smax] = opis.zakresSuwaka ?? opis.zakres;
  const glowa = opis.przelacznik
    ? `<label class="wiersz-etyk opcja-mala"><input type="checkbox"><span>${opis.przelacznik.etykieta}</span></label>`
    : `<label class="wiersz-etyk" for="${id}">${opis.etykieta}</label>`;
  w.innerHTML =
    glowa +
    `<input type="range" id="${id}" min="${smin}" max="${smax}" step="1" aria-label="${opis.etykieta}">` +
    `<span class="liczba"><input type="number" min="${min}" max="${max}" step="1" inputmode="numeric" aria-label="${opis.etykieta}, wartość">` +
    `<span class="jedn">${opis.jednostka}</span></span>`;
  const zakresEl = w.querySelector<HTMLInputElement>('input[type=range]')!;
  const liczbaEl = w.querySelector<HTMLInputElement>('input[type=number]')!;
  const chk = w.querySelector<HTMLInputElement>('input[type=checkbox]');
  if (opis.dodatek) w.append(opis.dodatek);

  const ustaw = (v: number) => {
    if (!Number.isFinite(v)) return;
    opis.zapisz(Math.min(max, Math.max(min, Math.round(v))));
  };
  zakresEl.addEventListener('input', () => ustaw(zakresEl.valueAsNumber));
  liczbaEl.addEventListener('input', () => {
    if (liczbaEl.value !== '' && liczbaEl.validity.valid) ustaw(liczbaEl.valueAsNumber);
  });
  // Zle albo puste pole po wyjsciu wraca do biezacej wartosci.
  liczbaEl.addEventListener('change', () => {
    if (liczbaEl.value === '') liczbaEl.valueAsNumber = opis.czytaj();
    else ustaw(liczbaEl.valueAsNumber);
    odswiez();
  });
  chk?.addEventListener('change', () => opis.przelacznik!.zapisz(chk.checked));

  wiersze.push({
    odswiez() {
      const v = opis.czytaj();
      if (document.activeElement !== liczbaEl) liczbaEl.valueAsNumber = v;
      zakresEl.valueAsNumber = v;
      const wylaczonyPrzelacznikiem = opis.przelacznik ? !opis.przelacznik.czytaj() : false;
      const nieczynny = (opis.nieczynny?.() ?? false) || wylaczonyPrzelacznikiem;
      zakresEl.disabled = nieczynny;
      liczbaEl.disabled = nieczynny;
      w.classList.toggle('nieczynny', opis.nieczynny?.() ?? false);
      if (chk) {
        chk.checked = opis.przelacznik!.czytaj();
        chk.disabled = opis.przelacznik!.nieczynny?.() ?? false;
      }
    },
  });
  rodzic.append(w);
}

const wymiary = $<HTMLDivElement>('wymiary');
const dodatki = $<HTMLDivElement>('dodatki');
const przesuniecie = $<HTMLDivElement>('przesuniecie');

suwak(wymiary, {
  etykieta: 'Długość',
  zakres: ZAKRESY.dlugosc,
  jednostka: 'px',
  czytaj: () => c.dlugosc,
  zapisz: (v) => zmien({ dlugosc: v }),
  nieczynny: () => c.ksztalt === 'kropka',
});
suwak(wymiary, {
  etykieta: 'Grubość',
  zakres: ZAKRESY.grubosc,
  jednostka: 'px',
  czytaj: () => c.grubosc,
  zapisz: (v) => zmien({ grubosc: v }),
  nieczynny: () => c.ksztalt === 'kropka',
});
suwak(wymiary, {
  etykieta: 'Przerwa',
  zakres: ZAKRESY.przerwa,
  jednostka: 'px',
  czytaj: () => c.przerwa,
  zapisz: (v) => zmien({ przerwa: v }),
  nieczynny: () => c.ksztalt === 'kropka' || c.ksztalt === 'okrag',
});

const kropkaWymuszona = () => c.ksztalt === 'kropka' || c.ksztalt === 'krzyz-kropka';
suwak(dodatki, {
  etykieta: 'Kropka',
  zakres: ZAKRESY.kropkaRozmiar,
  jednostka: 'px',
  czytaj: () => c.kropka.rozmiar,
  zapisz: (v) => zmien({ kropka: { ...c.kropka, rozmiar: v } }),
  przelacznik: {
    etykieta: 'Kropka',
    czytaj: () => c.kropka.wlaczona || kropkaWymuszona(),
    zapisz: (v) => zmien({ kropka: { ...c.kropka, wlaczona: v } }),
    nieczynny: kropkaWymuszona,
  },
});

const kolorObrysu = document.createElement('label');
kolorObrysu.className = 'kolor-obrysu';
kolorObrysu.title = 'Kolor obrysu';
kolorObrysu.innerHTML = '<input type="color" aria-label="Kolor obrysu">';
const kolorObrysuEl = kolorObrysu.querySelector('input')!;
kolorObrysuEl.addEventListener('input', () => zmien({ obrys: { ...c.obrys, kolor: kolorObrysuEl.value } }));
suwak(dodatki, {
  etykieta: 'Obrys',
  zakres: ZAKRESY.obrysGrubosc,
  jednostka: 'px',
  czytaj: () => c.obrys.grubosc,
  zapisz: (v) => zmien({ obrys: { ...c.obrys, grubosc: v } }),
  przelacznik: {
    etykieta: 'Obrys',
    czytaj: () => c.obrys.wlaczony,
    zapisz: (v) => zmien({ obrys: { ...c.obrys, wlaczony: v } }),
  },
  dodatek: kolorObrysu,
});
suwak(dodatki, {
  etykieta: 'Krycie',
  zakres: [0, 100],
  jednostka: '%',
  czytaj: () => Math.round(c.krycie * 100),
  zapisz: (v) => zmien({ krycie: v / 100 }),
});

suwak(przesuniecie, {
  etykieta: 'W bok (X)',
  zakres: ZAKRESY.przesuniecie,
  zakresSuwaka: [-60, 60],
  jednostka: 'px',
  czytaj: () => c.przesuniecieX,
  zapisz: (v) => zmien({ przesuniecieX: v }),
});
suwak(przesuniecie, {
  etykieta: 'W pionie (Y)',
  zakres: ZAKRESY.przesuniecie,
  zakresSuwaka: [-60, 60],
  jednostka: 'px',
  czytaj: () => c.przesuniecieY,
  zapisz: (v) => zmien({ przesuniecieY: v }),
});

// ---------- Zapisane celowniki ----------

const lista = $<HTMLUListElement>('lista');
const listaInfo = $<HTMLParagraphElement>('lista-info');
const formZapisz = $<HTMLFormElement>('zapisz-jako');
const poleNazwy = $<HTMLInputElement>('nazwa');
let edytowany: number | null = null;
let cofniecie: { indeks: number; wpis: Ustawienia['zapisane'][number]; zegar: number } | null = null;

async function zapiszListe(info: string | null) {
  try {
    u = await api.zapisz(u);
    pokazBlad(null);
    if (info !== null) listaInfo.textContent = info;
  } catch (e) {
    pokazBlad(`Nie zapisano listy celowników: ${e}`);
  }
  narysujListe();
}

function miniatura(cel: unknown, bok: number): string {
  return rysuj(cel, { szerokosc: bok, wysokosc: bok, dpr: devicePixelRatio || 1 });
}

function kafel(nazwa: string, cel: unknown, indeksWlasny: number | null): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'kafel';
  const aktywny = takiSam(cel, c);
  li.classList.toggle('aktywny', aktywny);

  if (indeksWlasny !== null && edytowany === indeksWlasny) {
    li.innerHTML = `<span class="kafel-mini" aria-hidden="true">${miniatura(cel, 40)}</span>`;
    const pole = document.createElement('input');
    pole.className = 'kafel-pole';
    pole.value = nazwa;
    pole.maxLength = 40;
    pole.setAttribute('aria-label', 'Nowa nazwa celownika, Enter zapisuje, Escape anuluje');
    pole.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const n = pole.value.trim();
        edytowany = null;
        if (n && n !== nazwa) {
          u.zapisane[indeksWlasny].nazwa = n;
          void zapiszListe(`Zmieniono nazwę na „${n}”.`);
        } else narysujListe();
      } else if (e.key === 'Escape') {
        edytowany = null;
        narysujListe();
      }
    });
    pole.addEventListener('blur', () => {
      if (edytowany === indeksWlasny) {
        edytowany = null;
        narysujListe();
      }
    });
    li.append(pole);
    queueMicrotask(() => pole.select());
    return li;
  }

  const wybierz = document.createElement('button');
  wybierz.type = 'button';
  wybierz.className = 'kafel-wybierz';
  wybierz.setAttribute('aria-pressed', String(aktywny));
  wybierz.innerHTML = `<span class="kafel-mini" aria-hidden="true">${miniatura(cel, 40)}</span><span class="kafel-nazwa"></span>`;
  wybierz.querySelector('.kafel-nazwa')!.textContent = nazwa;
  wybierz.title = indeksWlasny === null ? `${nazwa} (wbudowany)` : nazwa;
  wybierz.addEventListener('click', () => {
    zmien(waliduj(cel));
    listaInfo.textContent = '';
  });
  li.append(wybierz);

  if (indeksWlasny !== null) {
    const akcje = document.createElement('span');
    akcje.className = 'kafel-akcje';
    const zmienNazwe = document.createElement('button');
    zmienNazwe.type = 'button';
    zmienNazwe.textContent = 'Nazwa';
    zmienNazwe.setAttribute('aria-label', `Zmień nazwę: ${nazwa}`);
    zmienNazwe.addEventListener('click', () => {
      edytowany = indeksWlasny;
      narysujListe();
    });
    const usun = document.createElement('button');
    usun.type = 'button';
    usun.textContent = 'Usuń';
    usun.setAttribute('aria-label', `Usuń: ${nazwa}`);
    usun.addEventListener('click', () => usunWpis(indeksWlasny));
    akcje.append(zmienNazwe, usun);
    li.append(akcje);
  } else {
    const podpis = document.createElement('span');
    podpis.className = 'kafel-akcje kafel-wbudowany';
    podpis.textContent = 'wbudowany';
    li.append(podpis);
  }
  return li;
}

function narysujListe() {
  lista.replaceChildren(
    ...WZORY.map((w) => kafel(w.nazwa, w.celownik, null)),
    ...u.zapisane.map((z, i) => kafel(z.nazwa, z.celownik, i)),
  );
}

function usunWpis(i: number) {
  const wpis = u.zapisane[i];
  if (!wpis) return;
  if (cofniecie) clearTimeout(cofniecie.zegar);
  u.zapisane.splice(i, 1);
  cofniecie = {
    indeks: i,
    wpis,
    zegar: window.setTimeout(() => {
      cofniecie = null;
      listaInfo.textContent = '';
    }, CZAS_COFNIECIA),
  };
  void zapiszListe(null).then(() => {
    listaInfo.replaceChildren(`Usunięto „${wpis.nazwa}”. `);
    const przycisk = document.createElement('button');
    przycisk.type = 'button';
    przycisk.className = 'link';
    przycisk.textContent = 'Cofnij';
    przycisk.addEventListener('click', () => {
      if (!cofniecie) return;
      clearTimeout(cofniecie.zegar);
      u.zapisane.splice(Math.min(cofniecie.indeks, u.zapisane.length), 0, cofniecie.wpis);
      const n = cofniecie.wpis.nazwa;
      cofniecie = null;
      void zapiszListe(`Przywrócono „${n}”.`);
    });
    listaInfo.append(przycisk);
    przycisk.focus();
  });
}

formZapisz.addEventListener('submit', (e) => {
  e.preventDefault();
  const nazwa = poleNazwy.value.trim() || `Celownik ${u.zapisane.length + 1}`;
  const istniejacy = u.zapisane.findIndex((z) => z.nazwa === nazwa);
  if (istniejacy >= 0) {
    u.zapisane[istniejacy].celownik = c;
    void zapiszListe(`Nadpisano „${nazwa}”.`);
  } else {
    u.zapisane.push({ nazwa, celownik: c });
    void zapiszListe(`Zapisano „${nazwa}”.`);
  }
  poleNazwy.value = '';
});

// ---------- Kod z CS2 ----------

const kodForm = $<HTMLFormElement>('kod-form');
const kodPole = $<HTMLInputElement>('kod');
const kodInfo = $<HTMLParagraphElement>('kod-info');

function wysokoscMonitora(): number {
  const m = monitory.find((x) => x.nazwa === u.monitor) ?? monitory.find((x) => x.glowny) ?? monitory[0];
  return m?.wysokosc ?? 1080;
}

kodForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const w = czytajKod(kodPole.value, wysokoscMonitora());
  kodInfo.classList.toggle('blad', !w.ok);
  kodPole.setAttribute('aria-invalid', String(!w.ok));
  if (!w.ok) {
    kodInfo.textContent = w.blad;
    return;
  }
  zmien(w.celownik);
  kodInfo.textContent = `Wczytano (przeliczone na ${wysokoscMonitora()} px wysokości). Zapisz, żeby zachować.`;
  kodPole.value = '';
});

// ---------- Pasek stanu ----------

const wlacznik = $<HTMLButtonElement>('wlacznik');
const wlacznikTekst = $<HTMLSpanElement>('wlacznik-tekst');
const skrot = $<HTMLButtonElement>('skrot');
const skrotBlad = $<HTMLParagraphElement>('skrot-blad');
const monitor = $<HTMLSelectElement>('monitor');
const tylkoCs2 = $<HTMLInputElement>('tylko-cs2');

function pokazStan() {
  wlacznik.setAttribute('aria-checked', String(u.wlaczona));
  wlacznikTekst.textContent = u.wlaczona ? 'Nakładka włączona' : 'Nakładka wyłączona';
  tylkoCs2.checked = u.tylkoCs2;
  if (!nagrywanie) skrot.textContent = u.skrot;
  monitor.value = u.monitor ?? '';
}

wlacznik.addEventListener('click', async () => {
  try {
    u.wlaczona = await api.przelacz();
    pokazBlad(null);
  } catch (e) {
    pokazBlad(`Nie przełączono nakładki: ${e}`);
  }
  pokazStan();
});
api.naZmianeStanu((w) => {
  u.wlaczona = w;
  pokazStan();
});

tylkoCs2.addEventListener('change', async () => {
  u.tylkoCs2 = tylkoCs2.checked;
  await zapiszListe(null);
  pokazStan();
});

monitor.addEventListener('change', async () => {
  u.monitor = monitor.value || null;
  await zapiszListe(null);
  pokazStan();
});

function opisMonitora(m: Monitor, i: number): string {
  const nazwa = m.nazwa.replace(/^\\\\\.\\/, '') || `Monitor ${i + 1}`;
  return `${nazwa}, ${m.szerokosc}×${m.wysokosc}${m.glowny ? ', główny' : ''}`;
}

async function wczytajMonitory() {
  try {
    monitory = await api.monitory();
  } catch {
    monitory = [];
  }
  const glowny = monitory.find((m) => m.glowny);
  const opcje = [new Option(glowny ? `Główny (${opisMonitora(glowny, 0)})` : 'Główny', '')];
  monitory.forEach((m, i) => opcje.push(new Option(opisMonitora(m, i), m.nazwa)));
  monitor.replaceChildren(...opcje);
  pokazStan();
}

// Skrot: klik w pole, potem kombinacja klawiszy. Escape anuluje.
let nagrywanie = false;
const MODYFIKATORY = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS'];

function nazwaKlawisza(kod: string): string | null {
  if (/^Key[A-Z]$/.test(kod)) return kod.slice(3);
  if (/^Digit[0-9]$/.test(kod)) return kod.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(kod)) return kod;
  if (/^Numpad[0-9]$/.test(kod)) return kod;
  const inne = ['Space', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Backquote', 'Minus', 'Equal',
    'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backslash',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Pause', 'ScrollLock', 'NumpadAdd', 'NumpadSubtract',
    'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal'];
  return inne.includes(kod) ? kod : null;
}

function bladSkrotu(tekst: string | null) {
  skrotBlad.hidden = !tekst;
  skrotBlad.textContent = tekst ?? '';
  skrot.setAttribute('aria-invalid', String(Boolean(tekst)));
}

function koniecNagrywania() {
  nagrywanie = false;
  skrot.classList.remove('nagrywa');
  skrot.textContent = u.skrot;
}

skrot.addEventListener('click', () => {
  nagrywanie = true;
  skrot.classList.add('nagrywa');
  skrot.textContent = 'Wciśnij skrót…';
  bladSkrotu(null);
});
skrot.addEventListener('blur', () => nagrywanie && koniecNagrywania());
skrot.addEventListener('keydown', async (e) => {
  if (!nagrywanie) return;
  if (e.key === 'Tab') return koniecNagrywania();
  e.preventDefault();
  if (e.key === 'Escape') return koniecNagrywania();
  if (MODYFIKATORY.includes(e.key)) return;
  const klawisz = nazwaKlawisza(e.code);
  const mody = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  if (!klawisz) {
    koniecNagrywania();
    return bladSkrotu(`Klawisza „${e.key}” nie da się użyć w skrócie. Wybierz literę, cyfrę albo F1 do F24.`);
  }
  if (mody.length === 0 && !/^F\d+$/.test(klawisz)) {
    koniecNagrywania();
    return bladSkrotu('Skrót bez Ctrl, Alt albo Shift blokowałby ten klawisz w grze. Dodaj modyfikator albo użyj F1 do F24.');
  }
  const nowy = [...mody, klawisz].join('+');
  koniecNagrywania();
  if (nowy === u.skrot) return;
  try {
    u.skrot = await api.ustawSkrot(nowy);
    bladSkrotu(null);
  } catch (err) {
    bladSkrotu(String(err));
  }
  pokazStan();
});

// ---------- Aktualizacje (mechanizm w ui/src/aktualizacje.ts) ----------

export type StanAktualizacji =
  | { rodzaj: 'brak' }
  | { rodzaj: 'dostepna'; wersja: string; zaktualizuj: () => void }
  | { rodzaj: 'pobieranie'; procent: number | null }
  | { rodzaj: 'gotowa'; wersja: string }
  | { rodzaj: 'blad'; tekst: string };

const aktualizacja = $<HTMLSpanElement>('aktualizacja');
const aktualizacjaTekst = $<HTMLSpanElement>('aktualizacja-tekst');
const aktualizuj = $<HTMLButtonElement>('aktualizuj');
let naAktualizuj: (() => void) | null = null;
aktualizuj.addEventListener('click', () => naAktualizuj?.());
/** Napis o aktualizacji w stopce obok numeru wersji; przy nowej wersji z przyciskiem. */
export function pokazAktualizacje(stan: StanAktualizacji) {
  const teksty: Record<StanAktualizacji['rodzaj'], string> = {
    brak: '',
    dostepna: stan.rodzaj === 'dostepna' ? `Jest wersja ${stan.wersja}` : '',
    pobieranie:
      stan.rodzaj === 'pobieranie'
        ? stan.procent === null ? 'Pobieram aktualizację…' : `Pobieram aktualizację: ${Math.round(stan.procent)}%`
        : '',
    gotowa: stan.rodzaj === 'gotowa' ? `Wersja ${stan.wersja} czeka na restart` : '',
    blad: stan.rodzaj === 'blad' ? stan.tekst : '',
  };
  aktualizacjaTekst.textContent = teksty[stan.rodzaj];
  naAktualizuj = stan.rodzaj === 'dostepna' ? stan.zaktualizuj : null;
  aktualizuj.hidden = stan.rodzaj !== 'dostepna';
  aktualizacja.hidden = stan.rodzaj === 'brak';
  aktualizacja.classList.toggle('blad', stan.rodzaj === 'blad');
}

// ---------- Odswiezanie calosci ----------

function odswiez() {
  for (const r of ksztalty.querySelectorAll<HTMLInputElement>('input')) r.checked = r.value === c.ksztalt;
  for (const [k, el] of miniKsztaltu) {
    el.innerHTML = miniatura({ ...DOMYSLNY, ...c, ksztalt: k, przesuniecieX: 0, przesuniecieY: 0, krycie: 1 }, 28);
  }
  for (const r of probki.querySelectorAll<HTMLInputElement>('input')) r.checked = r.value === c.kolor;
  kolor.value = c.kolor.toLowerCase();
  kolorHex.textContent = c.kolor;
  kolorObrysuEl.value = c.obrys.kolor.toLowerCase();
  kolorObrysuEl.disabled = !c.obrys.wlaczony;
  for (const w of wiersze) w.odswiez();
  narysujPodglad();
  if (edytowany === null) narysujListe();
}

$<HTMLSpanElement>('wersja').textContent = `Muszka ${await api.wersja()}${api.udawany ? ' (podgląd bez Tauri)' : ''}`;
odswiez();
pokazStan();
void wczytajMonitory();
sledzAktualizacje(api.udawany, pokazAktualizacje);
