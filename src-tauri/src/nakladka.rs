//! Okno nakladki: przezroczyste, bez ramki, zawsze na wierzchu, bez fokusu, przepuszcza klikanie,
//! rozciagniete na caly wybrany monitor. Rysuje je ui/nakladka.html.
//!
//! Granica bezpieczenstwa (VAC): to okno jest jedyna rzecza, ktora Muszka pokazuje nad gra.
//! Zadnego czytania pamieci gry, wstrzykiwania, symulowania wejscia ani czytania pikseli ekranu.

use tauri::{AppHandle, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const ETYKIETA: &str = "nakladka";

/// Prostokat monitora w pikselach fizycznych.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Obszar {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

impl From<&Monitor> for Obszar {
    fn from(m: &Monitor) -> Self {
        Self { x: m.position().x, y: m.position().y, w: m.size().width, h: m.size().height }
    }
}

/// Monitor o podanej nazwie, a gdy go nie ma (odlaczony, brak nazwy): glowny, potem pierwszy z listy.
pub fn wybierz_monitor(app: &AppHandle, nazwa: Option<&str>) -> Option<Monitor> {
    let wszystkie = app.available_monitors().unwrap_or_default();
    if let Some(n) = nazwa {
        if let Some(m) = wszystkie.iter().find(|m| m.name().map(String::as_str) == Some(n)) {
            return Some(m.clone());
        }
    }
    app.primary_monitor().ok().flatten().or_else(|| wszystkie.into_iter().next())
}

/// Tworzy okno nakladki (ukryte do czasu ustawienia rozmiaru i stylow).
pub fn utworz(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let okno = WebviewWindowBuilder::new(app, ETYKIETA, WebviewUrl::App("nakladka.html".into()))
        .title("Muszka: celownik")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .focusable(false)
        .visible(false)
        .build()?;
    // Klikniecia ida przez okno do gry pod spodem. Na Linuksie (GTK) da sie to ustawic dopiero na
    // pokazanym oknie (tao 0.37 panikuje na ukrytym), wiec tam robi to widocznosc().
    #[cfg(windows)]
    {
        okno.set_ignore_cursor_events(true)?;
        windows::ustaw_style(&okno);
    }
    Ok(okno)
}

/// Rozciaga nakladke na wybrany monitor. Zwraca obszar, ktory ustawil.
pub fn dopasuj(okno: &WebviewWindow, monitor: &Monitor) -> Obszar {
    let o = Obszar::from(monitor);
    let _ = okno.set_size(PhysicalSize::new(o.w, o.h));
    let _ = okno.set_position(PhysicalPosition::new(o.x, o.y));
    o
}

/// Pokazuje albo chowa nakladke, nie zabierajac fokusu grze.
pub fn widocznosc(okno: &WebviewWindow, widoczna: bool) {
    #[cfg(windows)]
    {
        windows::widocznosc(okno, widoczna);
    }
    #[cfg(not(windows))]
    {
        if widoczna {
            let _ = okno.show();
            let _ = okno.set_ignore_cursor_events(true);
        } else {
            let _ = okno.hide();
        }
    }
}

/// Na Windows co jakis czas przypomina systemowi, ze nakladka ma byc nad gra
/// (gra w trybie "pelny ekran w oknie" potrafi wskoczyc nad okna zawsze na wierzchu).
pub fn przypnij_na_wierzch(_okno: &WebviewWindow) {
    #[cfg(windows)]
    windows::na_wierzch(_okno);
}

#[cfg(windows)]
mod windows {
    use tauri::WebviewWindow;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE,
        HWND_TOPMOST, LWA_ALPHA, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE,
        SW_SHOWNOACTIVATE, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
    };

    fn uchwyt(okno: &WebviewWindow) -> Option<HWND> {
        okno.hwnd().ok().map(|h| h.0 as HWND)
    }

    /// Okno narzedziowe (nie ma go w Alt+Tab), bez aktywacji (nie kradnie fokusu grze),
    /// przezroczyste dla myszy i warstwowe.
    pub fn ustaw_style(okno: &WebviewWindow) {
        let Some(h) = uchwyt(okno) else { return };
        unsafe {
            let styl = GetWindowLongPtrW(h, GWL_EXSTYLE);
            let nowy = styl | (WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TRANSPARENT | WS_EX_LAYERED) as isize;
            SetWindowLongPtrW(h, GWL_EXSTYLE, nowy);
            // Okno warstwowe bez tego wywolania w ogole sie nie rysuje. Alfa 255 = przezroczystosc
            // bierze sie tylko z przezroczystych pikseli strony.
            SetLayeredWindowAttributes(h, 0, 255, LWA_ALPHA);
            SetWindowPos(h, std::ptr::null_mut(), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        }
    }

    pub fn widocznosc(okno: &WebviewWindow, widoczna: bool) {
        let Some(h) = uchwyt(okno) else { return };
        unsafe {
            ShowWindow(h, if widoczna { SW_SHOWNOACTIVATE } else { SW_HIDE });
        }
        if widoczna {
            na_wierzch(okno);
        }
    }

    pub fn na_wierzch(okno: &WebviewWindow) {
        let Some(h) = uchwyt(okno) else { return };
        unsafe {
            SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }
}
