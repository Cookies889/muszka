//! Ustawienia Muszki w jednym pliku JSON w katalogu danych aplikacji (app_config_dir).
//!
//! Celownik lezy tu jako zwykly JSON: jego ksztalt i zakresy pilnuje model w ui/src/model.ts,
//! wiec Rust tylko go przechowuje i przekazuje nakladce.
//! Zapis jest atomowy (plik tymczasowy, fsync, rename), a zepsuty albo brakujacy plik daje
//! wartosci domyslne zamiast awarii.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const NAZWA_PLIKU: &str = "ustawienia.json";
pub const DOMYSLNY_SKROT: &str = "Alt+Shift+Z";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct ZapisanyCelownik {
    pub nazwa: String,
    pub celownik: Value,
}

impl Default for ZapisanyCelownik {
    fn default() -> Self {
        Self { nazwa: String::new(), celownik: Value::Null }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Ustawienia {
    /// Aktywny celownik (null = domyslny z model.ts).
    pub celownik: Value,
    /// Lista zapisanych celownikow.
    pub zapisane: Vec<ZapisanyCelownik>,
    /// Globalny skrot wlaczania i wylaczania, np. "Alt+Shift+Z".
    pub skrot: String,
    /// Nazwa monitora z nakladka; None = glowny.
    pub monitor: Option<String>,
    /// Czy celownik jest wlaczony.
    pub wlaczona: bool,
    /// Pokazuj celownik tylko wtedy, gdy na pierwszym planie jest cs2.exe.
    pub tylko_cs2: bool,
}

impl Default for Ustawienia {
    fn default() -> Self {
        Self {
            celownik: Value::Null,
            zapisane: Vec::new(),
            skrot: DOMYSLNY_SKROT.into(),
            monitor: None,
            wlaczona: true,
            tylko_cs2: false,
        }
    }
}

/// Wczytuje ustawienia. Brak pliku, zly JSON albo zle typy pol = wartosci domyslne.
pub fn wczytaj(sciezka: &Path) -> Ustawienia {
    let Ok(tekst) = fs::read_to_string(sciezka) else {
        return Ustawienia::default();
    };
    match serde_json::from_str::<Ustawienia>(&tekst) {
        Ok(mut u) => {
            if u.skrot.trim().is_empty() {
                u.skrot = DOMYSLNY_SKROT.into();
            }
            u
        }
        Err(e) => {
            eprintln!("Muszka: zepsuty plik ustawien ({e}), biore domyslne");
            Ustawienia::default()
        }
    }
}

/// Zapis atomowy: najpierw plik tymczasowy obok, potem rename na wlasciwa nazwe.
/// Przerwany zapis zostawia stary plik nienaruszony.
pub fn zapisz(sciezka: &Path, u: &Ustawienia) -> std::io::Result<()> {
    if let Some(katalog) = sciezka.parent() {
        fs::create_dir_all(katalog)?;
    }
    let tymczasowy = sciezka.with_extension("json.tmp");
    let tekst = serde_json::to_string_pretty(u).map_err(std::io::Error::other)?;
    {
        let mut f = fs::File::create(&tymczasowy)?;
        f.write_all(tekst.as_bytes())?;
        f.sync_all()?;
    }
    fs::rename(&tymczasowy, sciezka)
}

pub fn sciezka_w(katalog: &Path) -> PathBuf {
    katalog.join(NAZWA_PLIKU)
}

#[cfg(test)]
mod testy {
    use super::*;
    use serde_json::json;

    fn katalog_testu(nazwa: &str) -> PathBuf {
        let k = std::env::temp_dir().join(format!("muszka-test-{}-{nazwa}", std::process::id()));
        let _ = fs::remove_dir_all(&k);
        k
    }

    #[test]
    fn brak_pliku_daje_domyslne() {
        let k = katalog_testu("brak");
        assert_eq!(wczytaj(&sciezka_w(&k)), Ustawienia::default());
        assert_eq!(Ustawienia::default().skrot, "Alt+Shift+Z");
        assert!(Ustawienia::default().wlaczona);
        assert!(!Ustawienia::default().tylko_cs2);
    }

    #[test]
    fn zapis_i_odczyt_daja_to_samo() {
        let k = katalog_testu("zapis");
        let s = sciezka_w(&k);
        let u = Ustawienia {
            celownik: json!({"ksztalt": "krzyz", "kolor": "#FF0000"}),
            zapisane: vec![ZapisanyCelownik { nazwa: "Czerwony".into(), celownik: json!({"ksztalt": "krzyz"}) }],
            skrot: "Ctrl+F8".into(),
            monitor: Some("HDMI-A-1".into()),
            wlaczona: false,
            tylko_cs2: true,
        };
        zapisz(&s, &u).unwrap();
        assert_eq!(wczytaj(&s), u);
        // Po zapisie nie zostaje plik tymczasowy.
        assert!(!s.with_extension("json.tmp").exists());
        // Pola sa w camelCase, jak w TypeScripcie.
        assert!(fs::read_to_string(&s).unwrap().contains("\"tylkoCs2\": true"));
        let _ = fs::remove_dir_all(&k);
    }

    #[test]
    fn zepsuty_plik_daje_domyslne_bez_awarii() {
        let k = katalog_testu("zepsuty");
        let s = sciezka_w(&k);
        fs::create_dir_all(&k).unwrap();
        for zly in ["", "{", "null", "[1,2]", "{\"wlaczona\": \"tak\"}", "\u{0}\u{1}smieci"] {
            fs::write(&s, zly).unwrap();
            assert_eq!(wczytaj(&s), Ustawienia::default(), "plik: {zly:?}");
        }
        let _ = fs::remove_dir_all(&k);
    }

    #[test]
    fn brakujace_pola_dostaja_domyslne() {
        let k = katalog_testu("czesciowy");
        let s = sciezka_w(&k);
        fs::create_dir_all(&k).unwrap();
        fs::write(&s, r#"{"tylkoCs2": true, "skrot": "  "}"#).unwrap();
        let u = wczytaj(&s);
        assert!(u.tylko_cs2);
        assert!(u.wlaczona);
        assert_eq!(u.skrot, DOMYSLNY_SKROT);
        let _ = fs::remove_dir_all(&k);
    }

    #[test]
    fn zapis_nadpisuje_stary_plik() {
        let k = katalog_testu("nadpis");
        let s = sciezka_w(&k);
        zapisz(&s, &Ustawienia::default()).unwrap();
        let u = Ustawienia { wlaczona: false, ..Ustawienia::default() };
        zapisz(&s, &u).unwrap();
        assert!(!wczytaj(&s).wlaczona);
        let _ = fs::remove_dir_all(&k);
    }
}
