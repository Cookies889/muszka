//! Muszka: celownik nad gra. Osobny proces z dwoma oknami:
//! 'main' (edytor celownika) i 'nakladka' (przezroczyste okno z celownikiem na calym monitorze).
//! Wlaczanie i wylaczanie: globalny skrot (domyslnie Alt+Shift+Z), ikona w zasobniku albo przycisk w edytorze.

mod nakladka;
mod pilnowanie;
pub mod ustawienia;

use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use ustawienia::Ustawienia;

/// Argument drugiego uruchomienia, ktory przelacza celownik zamiast otwierac edytor
/// (np. `Muszka.exe --przelacz` pod klawiszem makr albo w skrocie na pulpicie).
const ARG_PRZELACZ: &str = "--przelacz";

pub struct Stan {
    ustawienia: Mutex<Ustawienia>,
    sciezka: PathBuf,
    /// Wynik ostatniego sprawdzenia, czy CS2 jest na pierwszym planie.
    cs2: AtomicBool,
    /// Obszar monitora, na ktory ostatnio rozciagnieto nakladke.
    obszar: Mutex<Option<nakladka::Obszar>>,
}

impl Stan {
    fn kopia(&self) -> Ustawienia {
        self.ustawienia.lock().unwrap().clone()
    }

    fn zapisz_na_dysk(&self) -> Result<(), String> {
        let u = self.kopia();
        ustawienia::zapisz(&self.sciezka, &u).map_err(|e| format!("Nie zapisano ustawień: {e}"))
    }
}

/// Celownik ma byc widoczny, gdy jest wlaczony i (przy opcji "tylko CS2") gra jest na wierzchu.
fn powinna_byc_widoczna(u: &Ustawienia, cs2_na_wierzchu: bool) -> bool {
    u.wlaczona && (!u.tylko_cs2 || cs2_na_wierzchu)
}

/// Ustawia widocznosc nakladki wedlug ustawien i ostatniego sprawdzenia gry.
fn odswiez_widocznosc(app: &AppHandle) {
    let stan = app.state::<Stan>();
    let widoczna = powinna_byc_widoczna(&stan.kopia(), stan.cs2.load(Ordering::Relaxed));
    if let Some(okno) = app.get_webview_window(nakladka::ETYKIETA) {
        nakladka::widocznosc(&okno, widoczna);
    }
}

/// Rozciaga nakladke na wybrany monitor, jesli zmienil sie monitor albo jego rozdzielczosc.
fn dopasuj_monitor(app: &AppHandle, na_sile: bool) {
    let stan = app.state::<Stan>();
    let nazwa = stan.kopia().monitor;
    let Some(monitor) = nakladka::wybierz_monitor(app, nazwa.as_deref()) else { return };
    let nowy = nakladka::Obszar::from(&monitor);
    let mut obszar = stan.obszar.lock().unwrap();
    if !na_sile && *obszar == Some(nowy) {
        return;
    }
    if let Some(okno) = app.get_webview_window(nakladka::ETYKIETA) {
        *obszar = Some(nakladka::dopasuj(&okno, &monitor));
    }
}

fn pokaz_edytor(app: &AppHandle) {
    if let Some(okno) = app.get_webview_window("main") {
        let _ = okno.unminimize();
        let _ = okno.show();
        let _ = okno.set_focus();
    }
}

/// Wlacza albo wylacza celownik, zapisuje stan i mowi o tym edytorowi. Zwraca nowy stan.
fn przelacz(app: &AppHandle) -> Result<bool, String> {
    let stan = app.state::<Stan>();
    let wlaczona = {
        let mut u = stan.ustawienia.lock().unwrap();
        u.wlaczona = !u.wlaczona;
        u.wlaczona
    };
    odswiez_widocznosc(app);
    let _ = app.emit_to("main", "stan", wlaczona);
    stan.zapisz_na_dysk()?;
    Ok(wlaczona)
}

/// Podmienia globalny skrot. Gdy nowego nie da sie zarejestrowac, wraca stary.
fn zmien_skrot(app: &AppHandle, stary: &str, nowy: &str) -> Result<(), String> {
    let skrot: Shortcut = nowy.parse().map_err(|_| format!("Nieznany skrót: {nowy}"))?;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if let Err(e) = gs.register(skrot) {
        if let Ok(s) = stary.parse::<Shortcut>() {
            let _ = gs.register(s);
        }
        return Err(format!("Skrót {nowy} jest zajęty albo niedostępny: {e}"));
    }
    Ok(())
}

// ---------- Komendy Tauri ----------

#[tauri::command]
fn wczytaj_ustawienia(stan: State<'_, Stan>) -> Ustawienia {
    stan.kopia()
}

#[tauri::command]
fn zapisz_ustawienia(app: AppHandle, stan: State<'_, Stan>, ustawienia: Ustawienia) -> Result<Ustawienia, String> {
    let stare = stan.kopia();
    let mut nowe = ustawienia;
    if nowe.skrot.trim().is_empty() {
        nowe.skrot = stare.skrot.clone();
    }
    if nowe.skrot != stare.skrot {
        if let Err(e) = zmien_skrot(&app, &stare.skrot, &nowe.skrot) {
            // Reszta ustawien i tak sie zapisuje, skrot zostaje stary.
            nowe.skrot = stare.skrot.clone();
            *stan.ustawienia.lock().unwrap() = nowe;
            stan.zapisz_na_dysk()?;
            return Err(e);
        }
    }
    *stan.ustawienia.lock().unwrap() = nowe.clone();
    if nowe.monitor != stare.monitor {
        dopasuj_monitor(&app, true);
    }
    odswiez_widocznosc(&app);
    let _ = app.emit_to(nakladka::ETYKIETA, "celownik", &nowe.celownik);
    stan.zapisz_na_dysk()?;
    Ok(nowe)
}

/// Nowy aktywny celownik: nakladka dostaje go od razu zdarzeniem 'celownik'.
/// `zapisz: false` = tylko nakladka i pamiec (edytor wola tak przy kazdym ruchu suwaka,
/// a zapis na dysk robi raz, ok. 300 ms po ostatniej zmianie). Brak pola = zapis od razu.
#[tauri::command]
fn ustaw_celownik(app: AppHandle, stan: State<'_, Stan>, celownik: Value, zapisz: Option<bool>) -> Result<(), String> {
    stan.ustawienia.lock().unwrap().celownik = celownik.clone();
    app.emit_to(nakladka::ETYKIETA, "celownik", &celownik).map_err(|e| e.to_string())?;
    if zapisz.unwrap_or(true) {
        stan.zapisz_na_dysk()?;
    }
    Ok(())
}

#[tauri::command]
fn przelacz_nakladke(app: AppHandle) -> Result<bool, String> {
    przelacz(&app)
}

#[tauri::command]
fn ustaw_skrot(app: AppHandle, stan: State<'_, Stan>, skrot: String) -> Result<String, String> {
    let stary = stan.kopia().skrot;
    let nowy = skrot.trim().to_string();
    zmien_skrot(&app, &stary, &nowy)?;
    stan.ustawienia.lock().unwrap().skrot = nowy.clone();
    stan.zapisz_na_dysk()?;
    Ok(nowy)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpisMonitora {
    nazwa: String,
    szerokosc: u32,
    wysokosc: u32,
    glowny: bool,
}

#[tauri::command]
fn lista_monitorow(app: AppHandle) -> Vec<OpisMonitora> {
    let glowny = app.primary_monitor().ok().flatten().and_then(|m| m.name().cloned());
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| OpisMonitora {
            nazwa: m.name().cloned().unwrap_or_default(),
            szerokosc: m.size().width,
            wysokosc: m.size().height,
            glowny: m.name().is_some() && m.name().cloned() == glowny,
        })
        .collect()
}

// ---------- Zasobnik i watek pilnujacy ----------

fn zbuduj_zasobnik(app: &AppHandle) -> tauri::Result<()> {
    let przelacz_poz = MenuItem::with_id(app, "przelacz", "Pokaż/ukryj celownik", true, None::<&str>)?;
    let otworz = MenuItem::with_id(app, "otworz", "Otwórz Muszkę", true, None::<&str>)?;
    let zakoncz = MenuItem::with_id(app, "zakoncz", "Zakończ", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&przelacz_poz, &otworz, &PredefinedMenuItem::separator(app)?, &zakoncz])?;
    let mut zasobnik = TrayIconBuilder::with_id("muszka")
        .tooltip("Muszka")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, zdarzenie| match zdarzenie.id().as_ref() {
            "przelacz" => {
                let _ = przelacz(app);
            }
            "otworz" => pokaz_edytor(app),
            "zakoncz" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|ikona, zdarzenie| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = zdarzenie {
                pokaz_edytor(ikona.app_handle());
            }
        });
    if let Some(ikona) = app.default_window_icon() {
        zasobnik = zasobnik.icon(ikona.clone());
    }
    zasobnik.build(app)?;
    Ok(())
}

/// Co ok. 250 ms: czy CS2 jest na wierzchu (tylko przy wlaczonej opcji).
/// Co ok. 1 s: czy monitor nie zmienil rozdzielczosci i czy nakladka dalej jest nad gra.
fn uruchom_pilnowanie(app: AppHandle) {
    std::thread::spawn(move || {
        let mut takt: u32 = 0;
        loop {
            std::thread::sleep(Duration::from_millis(250));
            takt = takt.wrapping_add(1);
            let stan = app.state::<Stan>();
            let u = stan.kopia();
            let cs2 = !u.tylko_cs2 || pilnowanie::cs2_na_wierzchu();
            if stan.cs2.swap(cs2, Ordering::Relaxed) != cs2 {
                let a = app.clone();
                let _ = app.run_on_main_thread(move || odswiez_widocznosc(&a));
            }
            if takt % 4 == 0 {
                let a = app.clone();
                let widoczna = powinna_byc_widoczna(&u, cs2);
                let _ = app.run_on_main_thread(move || {
                    dopasuj_monitor(&a, false);
                    if widoczna {
                        if let Some(okno) = a.get_webview_window(nakladka::ETYKIETA) {
                            nakladka::przypnij_na_wierzch(&okno);
                        }
                    }
                });
            }
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        // Jedna instancja: musi byc pierwszym pluginem. Drugie uruchomienie pokazuje edytor
        // (albo z argumentem --przelacz przelacza celownik).
        .plugin(tauri_plugin_single_instance::init(|app, argv, _katalog| {
            if argv.iter().any(|a| a == ARG_PRZELACZ) {
                let _ = przelacz(app);
            } else {
                pokaz_edytor(app);
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _skrot, zdarzenie| {
                    if zdarzenie.state() == ShortcutState::Pressed {
                        let _ = przelacz(app);
                    }
                })
                .build(),
        )
        // Aktualizacje z GitHub Releases (sprawdza i instaluje edytor, tylko po kliknieciu).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let katalog = app.path().app_config_dir()?;
            let sciezka = ustawienia::sciezka_w(&katalog);
            let u = ustawienia::wczytaj(&sciezka);
            let skrot = u.skrot.clone();
            app.manage(Stan {
                ustawienia: Mutex::new(u),
                sciezka,
                cs2: AtomicBool::new(true),
                obszar: Mutex::new(None),
            });
            let h = app.handle().clone();

            nakladka::utworz(&h)?;
            dopasuj_monitor(&h, true);
            odswiez_widocznosc(&h);

            zbuduj_zasobnik(&h)?;

            // Skrot, ktorego system nie przyjmie (zajety, Wayland), nie blokuje startu:
            // celownik da sie dalej przelaczac z zasobnika i z edytora.
            if let Err(e) = h.global_shortcut().register(skrot.as_str()) {
                eprintln!("Muszka: nie zarejestrowano skrotu {skrot}: {e}");
            }

            uruchom_pilnowanie(h);
            Ok(())
        })
        .on_window_event(|okno, zdarzenie| {
            // Zamkniecie edytora chowa go do zasobnika; nakladka dziala dalej. Wyjscie: Zakoncz w zasobniku.
            if okno.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = zdarzenie {
                    api.prevent_close();
                    let _ = okno.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            wczytaj_ustawienia,
            zapisz_ustawienia,
            ustaw_celownik,
            przelacz_nakladke,
            ustaw_skrot,
            lista_monitorow,
        ])
        .run(tauri::generate_context!())
        .expect("Muszka nie mogla sie uruchomic");
}

#[cfg(test)]
mod testy {
    use super::*;

    #[test]
    fn widocznosc_zalezy_od_wlacznika_i_gry() {
        let mut u = Ustawienia::default();
        assert!(powinna_byc_widoczna(&u, false), "bez opcji CS2 gra nie ma znaczenia");
        u.tylko_cs2 = true;
        assert!(!powinna_byc_widoczna(&u, false));
        assert!(powinna_byc_widoczna(&u, true));
        u.wlaczona = false;
        assert!(!powinna_byc_widoczna(&u, true));
    }

    #[test]
    fn domyslny_skrot_sie_parsuje() {
        assert!(ustawienia::DOMYSLNY_SKROT.parse::<Shortcut>().is_ok());
    }
}
