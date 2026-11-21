// Aktualizacje z GitHub Releases: przy starcie i co 6 h edytor pyta latest.json
// (adres i klucz publiczny w src-tauri/tauri.conf.json, plugins.updater).
// Nowa wersja = napis w stopce z przyciskiem. Nic nie instaluje sie samo: pobranie,
// instalacja i restart dopiero po kliknieciu (instalator nie moze wyskoczyc w trakcie meczu).
// Brak sieci albo GitHub nie odpowiada = cisza, sprobujemy przy nastepnym sprawdzeniu.
// W zwyklej przegladarce ?aktualizacja=1 pokazuje przykladowa wersje (podglad stopki).

import type { StanAktualizacji } from './main.ts';

export const CO_ILE_MS = 6 * 60 * 60 * 1000;

export interface Nowa {
  wersja: string;
  /** Pobiera i instaluje; postep w procentach (null, gdy serwer nie podal rozmiaru). */
  pobierz: (postep: (procent: number | null) => void) => Promise<void>;
  restart: () => Promise<void>;
}

/** Procent pobrania albo null, gdy rozmiar nieznany. */
export function procent(pobrane: number, razem: number | null): number | null {
  if (!razem || razem <= 0) return null;
  return Math.min(100, (pobrane / razem) * 100);
}

async function sprawdzTauri(): Promise<Nowa | null> {
  const { check } = await import('@tauri-apps/plugin-updater');
  const { relaunch } = await import('@tauri-apps/plugin-process');
  const u = await check();
  if (!u) return null;
  return {
    wersja: u.version,
    pobierz: async (postep) => {
      let pobrane = 0;
      let razem: number | null = null;
      await u.downloadAndInstall((z) => {
        if (z.event === 'Started') razem = z.data.contentLength ?? null;
        else if (z.event === 'Progress') pobrane += z.data.chunkLength;
        postep(procent(pobrane, razem));
      });
    },
    restart: relaunch,
  };
}

function udawana(): Nowa {
  return {
    wersja: '0.1.1',
    pobierz: async (postep) => {
      for (let p = 0; p <= 100; p += 20) {
        postep(p);
        await new Promise((r) => setTimeout(r, 150));
      }
    },
    restart: async () => location.reload(),
  };
}

type Pokaz = (stan: StanAktualizacji) => void;

let trwa = false;
let pokazana = '';

function zaproponuj(n: Nowa, pokaz: Pokaz) {
  if (trwa || pokazana === n.wersja) return;
  pokazana = n.wersja;
  pokaz({
    rodzaj: 'dostepna',
    wersja: n.wersja,
    zaktualizuj: async () => {
      if (trwa) return;
      trwa = true;
      pokaz({ rodzaj: 'pobieranie', procent: null });
      try {
        await n.pobierz((p) => pokaz({ rodzaj: 'pobieranie', procent: p }));
        pokaz({ rodzaj: 'gotowa', wersja: n.wersja });
        await n.restart();
      } catch (e) {
        trwa = false;
        pokazana = '';
        pokaz({ rodzaj: 'blad', tekst: `Aktualizacja nie wyszła: ${e instanceof Error ? e.message : String(e)}` });
      }
    },
  });
}

async function sprawdz(tauri: boolean, pokaz: Pokaz) {
  try {
    const n = tauri ? await sprawdzTauri() : udawana();
    if (n) zaproponuj(n, pokaz);
  } catch (e) {
    console.warn('Muszka: sprawdzanie aktualizacji nie wyszło', e);
  }
}

export function sledzAktualizacje(udawany: boolean, pokaz: Pokaz) {
  if (udawany) {
    if (new URLSearchParams(location.search).get('aktualizacja')) void sprawdz(false, pokaz);
    return;
  }
  void sprawdz(true, pokaz);
  setInterval(() => void sprawdz(true, pokaz), CO_ILE_MS);
}
