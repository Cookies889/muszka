// Udawany backend do ogladania edytora w zwyklej przegladarce (bez Tauri).
// Ustawienia leza w localStorage pod kluczem KLUCZ, dwa udawane monitory, a skroty z listy ZAJETE
// odpowiadaja tym samym bledem co prawdziwy backend, zeby dalo sie obejrzec komunikat.

import type { Backend, Monitor, Ustawienia } from './api.ts';

const KLUCZ = 'muszka-udawane-ustawienia';

const DOMYSLNE: Ustawienia = {
  celownik: null,
  zapisane: [],
  skrot: 'Alt+Shift+Z',
  monitor: null,
  wlaczona: true,
  tylkoCs2: false,
};

const MONITORY: Monitor[] = [
  { nazwa: '\\\\.\\DISPLAY1', szerokosc: 1920, wysokosc: 1080, glowny: true },
  { nazwa: '\\\\.\\DISPLAY2', szerokosc: 2560, wysokosc: 1440, glowny: false },
];

/** Skroty, ktore w udawanym systemie trzyma juz inny program. */
const ZAJETE = ['Alt+Tab', 'Ctrl+Shift+Escape', 'Super+L'];

function wczytajZPamieci(): Ustawienia {
  try {
    const t = localStorage.getItem(KLUCZ);
    if (!t) return structuredClone(DOMYSLNE);
    const w = JSON.parse(t) as Partial<Ustawienia>;
    if (!w || typeof w !== 'object') return structuredClone(DOMYSLNE);
    return {
      celownik: w.celownik ?? null,
      zapisane: Array.isArray(w.zapisane) ? w.zapisane : [],
      skrot: typeof w.skrot === 'string' && w.skrot.trim() ? w.skrot : DOMYSLNE.skrot,
      monitor: typeof w.monitor === 'string' ? w.monitor : null,
      wlaczona: typeof w.wlaczona === 'boolean' ? w.wlaczona : true,
      tylkoCs2: typeof w.tylkoCs2 === 'boolean' ? w.tylkoCs2 : false,
    };
  } catch {
    return structuredClone(DOMYSLNE);
  }
}

export function udawanyBackend(): Backend {
  let u = wczytajZPamieci();
  const zapiszDoPamieci = () => localStorage.setItem(KLUCZ, JSON.stringify(u));
  const sprawdzSkrot = (s: string) => {
    if (ZAJETE.includes(s)) throw `Skrót ${s} jest zajęty albo niedostępny: używa go inny program`;
  };

  return {
    udawany: true,
    wersja: async () => '0.1.0',
    wczytaj: async () => structuredClone(u),
    zapisz: async (nowe) => {
      const stary = u.skrot;
      u = structuredClone(nowe);
      if (u.skrot !== stary) {
        try {
          sprawdzSkrot(u.skrot);
        } catch (e) {
          u.skrot = stary;
          zapiszDoPamieci();
          throw e;
        }
      }
      zapiszDoPamieci();
      return structuredClone(u);
    },
    ustawCelownik: async (celownik, zapisz) => {
      u.celownik = celownik;
      if (zapisz) zapiszDoPamieci();
    },
    przelacz: async () => {
      u.wlaczona = !u.wlaczona;
      zapiszDoPamieci();
      return u.wlaczona;
    },
    ustawSkrot: async (skrot) => {
      sprawdzSkrot(skrot);
      u.skrot = skrot;
      zapiszDoPamieci();
      return skrot;
    },
    monitory: async () => structuredClone(MONITORY),
    naZmianeStanu: () => {},
  };
}
