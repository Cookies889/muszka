// Okno nakladki: rysuje aktywny celownik na calym monitorze i przerysowuje go
// po zdarzeniu 'celownik' z Rusta albo po zmianie rozmiaru okna (inna rozdzielczosc, inny monitor).

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { waliduj, type Celownik } from './model.ts';
import { rysuj } from './rysuj.ts';

const miejsce = document.getElementById('celownik')!;
let celownik: Celownik = waliduj(null);

function narysuj() {
  miejsce.innerHTML = rysuj(celownik, {
    szerokosc: window.innerWidth,
    wysokosc: window.innerHeight,
    dpr: window.devicePixelRatio,
  });
}

window.addEventListener('resize', narysuj);
// Zmiana skali ekranu nie zawsze daje 'resize', ale zawsze zmienia devicePixelRatio.
matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', narysuj);

await listen<unknown>('celownik', (z) => {
  celownik = waliduj(z.payload);
  narysuj();
});

try {
  const u = await invoke<{ celownik: unknown }>('wczytaj_ustawienia');
  celownik = waliduj(u.celownik);
} catch (e) {
  console.error('Muszka: nie wczytano ustawien', e);
}
narysuj();
