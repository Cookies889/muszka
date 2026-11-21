//! Opcja "tylko gdy CS2 na wierzchu": watek co ok. 250 ms sprawdza nazwe exe okna na pierwszym planie.
//!
//! Jedyne, co czytamy o grze, to nazwa jej pliku exe (GetForegroundWindow, GetWindowThreadProcessId,
//! QueryFullProcessImageNameW z prawem PROCESS_QUERY_LIMITED_INFORMATION). Pamieci gry nie otwieramy.

/// Nazwa pliku gry, przy ktorej celownik ma byc widoczny.
#[cfg_attr(not(windows), allow(dead_code))]
pub const EXE_GRY: &str = "cs2.exe";

/// Czy na pierwszym planie jest CS2. Poza Windows zawsze true (atrapa do testow na Linuksie).
pub fn cs2_na_wierzchu() -> bool {
    #[cfg(windows)]
    {
        windows::exe_na_wierzchu().is_some_and(|n| czy_gra(&n))
    }
    #[cfg(not(windows))]
    {
        true
    }
}

/// Czy pelna sciezka albo nazwa exe to CS2 (bez wzgledu na wielkosc liter).
#[cfg_attr(not(windows), allow(dead_code))]
pub fn czy_gra(sciezka: &str) -> bool {
    let nazwa = sciezka.rsplit(['\\', '/']).next().unwrap_or(sciezka);
    nazwa.eq_ignore_ascii_case(EXE_GRY)
}

#[cfg(windows)]
mod windows {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    /// Pelna sciezka exe procesu, do ktorego nalezy okno na pierwszym planie.
    pub fn exe_na_wierzchu() -> Option<String> {
        unsafe {
            let okno = GetForegroundWindow();
            if okno.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(okno, &mut pid);
            if pid == 0 {
                return None;
            }
            let proces = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if proces.is_null() {
                return None;
            }
            let mut bufor = [0u16; 1024];
            let mut dlugosc = bufor.len() as u32;
            let ok = QueryFullProcessImageNameW(proces, PROCESS_NAME_WIN32, bufor.as_mut_ptr(), &mut dlugosc);
            CloseHandle(proces);
            (ok != 0).then(|| String::from_utf16_lossy(&bufor[..dlugosc as usize]))
        }
    }
}

#[cfg(test)]
mod testy {
    use super::*;

    #[test]
    fn rozpoznaje_cs2_po_nazwie_pliku() {
        assert!(czy_gra(r"C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe"));
        assert!(czy_gra("CS2.EXE"));
        assert!(!czy_gra(r"C:\Windows\explorer.exe"));
        assert!(!czy_gra(r"C:\gry\cs2.exe.bak"));
        assert!(!czy_gra("notcs2.exe"));
    }
}
