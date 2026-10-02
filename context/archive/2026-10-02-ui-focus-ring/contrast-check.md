# Kontrast pierścienia fokusu — skrypt i wyniki

Skrypt, z którego pochodzą wszystkie liczby w `research.md`. Zapisany tutaj, bo skrypt z
`ui-enhancement` nigdy nie trafił do repo (archiwum, `screenshots/README.md:13-14`), a jego
szacunek L ≈ 0.38 okazał się błędny (`reviews/impl-review.md:57`).

Metoda: oklch → sRGB (Björn Ottosson, przycięcie do gamutu) → składanie przezroczystości w sRGB
z korekcją gamma (tak składa przeglądarka) → luminancja i współczynnik kontrastu WCAG 2.
Wartości tokenów przepisane z `src/styles/global.css` @ `f3f3537` (`:root` :12-50, `.dark` :54-101).
Uruchomienie: zapisz blok jako `contrast.mjs` poza repo i `node contrast.mjs` (bez zależności).

```js
const toSrgb = ([L, C, h]) => {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return lin.map((x) => { x = Math.min(1, Math.max(0, x)); return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055; });
};
const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const lum = (c) => { const [r, g, b] = c.map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return ((a + 0.05) / (b + 0.05)).toFixed(2); };
const T = {
  light: { bg: [1, 0, 0], card: [1, 0, 0], ring: [0.5, 0.085, 184.704], primary: [0.5, 0.085, 184.704], destructive: [0.577, 0.245, 27.325], secondary: [0.97, 0, 0] },
  dark: { bg: [0.145, 0, 0], card: [0.205, 0, 0], ring: [0.78, 0.12, 184.704], primary: [0.78, 0.12, 184.704], destructive: [0.704, 0.191, 22.216], secondary: [0.269, 0, 0] },
};
for (const [name, t] of Object.entries(T)) {
  const s = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, toSrgb(v)]));
  console.log(`\n## ${name}`);
  for (const surf of ["bg", "card"]) {
    console.log(`ring/α vs ${surf}:`, [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1].map((a) => `${a * 100}%:${cr(over(s.ring, a, s[surf]), s[surf])}`).join("  "));
    console.log(`destructive/α vs ${surf}:`, [0.2, 0.4, 0.5, 0.7, 0.75, 1].map((a) => `${a * 100}%:${cr(over(s.destructive, a, s[surf]), s[surf])}`).join("  "));
  }
  console.log("ring/50 vs primary fill:", cr(over(s.ring, 0.5, s.bg), s.primary), " ring/75:", cr(over(s.ring, 0.75, s.bg), s.primary), " full ring:", cr(s.ring, s.primary));
  console.log("gap (bg) vs primary fill:", cr(s.bg, s.primary), " gap (card) vs primary fill:", cr(s.card, s.primary));
  console.log("ring/75 on card vs secondary fill:", cr(over(s.ring, 0.75, s.card), s.secondary));
}
for (let L = 0.5; L > 0.1; L -= 0.01) {
  const r = toSrgb([L, (0.085 * L) / 0.5, 184.704]);
  if (+cr(over(r, 0.5, [1, 1, 1]), [1, 1, 1]) >= 3) { console.log("\n/50 reaches 3:1 on white at L≈", L.toFixed(2)); break; }
}
```

## Wyniki (2026-10-02)

`bg` = `--background`, `card` = `--card`. W jasnym motywie oba to `oklch(1 0 0)`, więc kolumny się
pokrywają.

| Para | Jasny | Ciemny (tło / karta) |
|---|---|---|
| `ring/50` na powierzchni (dziś) | 2.19 | 3.27 / 3.25 |
| `ring/60` | 2.62 | 4.25 / 4.13 |
| `ring/70` | 3.16 | 5.45 / 5.19 |
| `ring/75` | 3.48 | 6.13 / 5.78 |
| `ring/80` | 3.84 | 6.87 / 6.41 |
| `ring` (100%) | 5.74 | 10.41 / 9.42 |
| `destructive/20` na powierzchni (dziś, jasny) | 1.44 | 1.29 / 1.34 |
| `destructive/40` na powierzchni (dziś, ciemny) | 2.11 | 1.95 / 1.98 |
| `destructive/70` | 3.61 | 3.80 / 3.62 |
| `destructive/75` | 3.87 | 4.22 / 3.98 |
| `destructive` (100%) | 4.76 | 6.84 / 6.19 |
| `ring/50` złożony na tle vs wypełnienie przycisku `default` | 2.62 | 3.19 |
| `ring/75` vs wypełnienie `default` | 1.65 | 1.70 |
| `ring` (100%) vs wypełnienie `default` | 1.00 | 1.00 |
| szczelina w kolorze tła vs wypełnienie `default` | 5.74 | 10.41 (na karcie 9.42) |
| `ring/75` na karcie vs wypełnienie `secondary` | 3.19 | 4.87 |

Próg z `known-drift.md:132-133` potwierdzony: `/50` na białym osiąga 3:1 dopiero przy `--ring`
L ≈ 0.29 (przy chroma skalowanej z L).
