// Jedno wejscie do backendu edytora: w oknie Tauri prawdziwe komendy z src-tauri/src/lib.rs,
// w zwyklej przegladarce udawany backend z ui/src/udawany.ts (ustawienia w localStorage).

export interface Zapisany {
  nazwa: string;
  celownik: unknown;
}

export interface Ustawienia {
  celownik: unknown;
  zapisane: Zapisany[];
  skrot: string;
  /** Nazwa monitora z nakladka; null = glowny. */
  monitor: string | null;
  wlaczona: boolean;
  tylkoCs2: boolean;
}

export interface Monitor {
  nazwa: string;
  szerokosc: number;
  wysokosc: number;
  glowny: boolean;
}

export interface Backend {
  udawany: boolean;
  wersja(): Promise<string>;
  wczytaj(): Promise<Ustawienia>;
  /** Zapis calosci; zwraca to, co naprawde zapisano (np. stary skrot, gdy nowy byl zajety). */
  zapisz(u: Ustawienia): Promise<Ustawienia>;
  /** Celownik do nakladki od razu; `zapisz` = tez na dysk. */
  ustawCelownik(celownik: unknown, zapisz: boolean): Promise<void>;
  przelacz(): Promise<boolean>;
  /** Zwraca przyjety skrot albo rzuca komunikat (zajety, nieznany). */
  ustawSkrot(skrot: string): Promise<string>;
  monitory(): Promise<Monitor[]>;
  /** Skrot globalny albo zasobnik przelaczyl nakladke. */
  naZmianeStanu(f: (wlaczona: boolean) => void): void;
}

function wTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function tauriBackend(): Promise<Backend> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  const { getVersion } = await import('@tauri-apps/api/app');
  return {
    udawany: false,
    wersja: () => getVersion(),
    wczytaj: () => invoke<Ustawienia>('wczytaj_ustawienia'),
    zapisz: (ustawienia) => invoke<Ustawienia>('zapisz_ustawienia', { ustawienia }),
    ustawCelownik: (celownik, zapisz) => invoke<void>('ustaw_celownik', { celownik, zapisz }),
    przelacz: () => invoke<boolean>('przelacz_nakladke'),
    ustawSkrot: (skrot) => invoke<string>('ustaw_skrot', { skrot }),
    monitory: () => invoke<Monitor[]>('lista_monitorow'),
    naZmianeStanu: (f) => void listen<boolean>('stan', (z) => f(z.payload)),
  };
}

export async function backend(): Promise<Backend> {
  if (wTauri()) return tauriBackend();
  const { udawanyBackend } = await import('./udawany.ts');
  return udawanyBackend();
}
