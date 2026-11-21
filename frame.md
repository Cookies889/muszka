---
name: Muszka, edytor celownika
description: >
  Ciemny panel narzędzia, gęsty jak panel właściwości w programie 3D. Jeden akcent:
  zieleń celownika, tylko na tym, co włączone albo wybrane. Granice 1 px zamiast cieni,
  zero gradientów, poświat i szkła. Źródło wartości: ui/src/styl.css (:root).
canvas: dark

colors:
  hue: 145                          # wspólny odcień szarości i akcentu (oklch)
  bg: "oklch(17% 0.008 145)"        # --tlo
  surface: "oklch(21% 0.009 145)"   # --pole
  surface-2: "oklch(25% 0.010 145)" # --pole-2
  border: "oklch(30% 0.010 145)"    # --linia
  text: "oklch(94% 0.006 145)"      # --tekst
  text-muted: "oklch(72% 0.010 145)" # --slaby
  accent: "oklch(78% 0.20 145)"     # --akcent, zieleń celownika
  accent-hover: "oklch(71% 0.20 145)"
  accent-text: "oklch(20% 0.02 145)"
  error: "oklch(74% 0.15 25)"       # --blad
  preview-backgrounds:              # płaskie barwy map w podglądzie, bez zrzutów z gry
    mur: "oklch(80% 0.045 80)"
    korytarz: "oklch(32% 0.012 60)"
    niebo: "oklch(82% 0.045 235)"
    zielen: "oklch(52% 0.07 135)"

typography:
  family: "Hubot Sans (woff2 w ui/public/fonty, latin i latin-ext)"
  brand: 16px / 700 / letter-spacing -0.01em
  section-label: 12px / wersaliki / letter-spacing 0.08em / text-muted
  body: 13px
  small: 11 do 12px
  numbers: font-variant-numeric tabular-nums (pola liczb, hex koloru)

shape:
  radius: 6px                       # --r
  radius-small: 3px                 # --r-maly
  switch: 10px (tor przełącznika), uchwyt 50%

spacing:
  base: 8px
  control-min-height: 36px

motion:
  duration: 150ms                   # --szybko
  easing: "cubic-bezier(0.16, 1, 0.3, 1)"
  animate: tylko background-color i transform (uchwyt przełącznika)
  reduced-motion: przejścia wyłączone

rules:
  - Akcent tylko na stanie włączonym i wybranym (przełącznik, wybrany kształt, kafel, suwak).
  - Podgląd celownika zawsze 1:1 w pikselach fizycznych, lupa ×4 osobno, bez wygładzania.
  - Żadnego backdrop-filter, cieni z poświatą, gradientów ani emoji.
  - Wygląd własny: nie kopiujemy innych edytorów celowników.
