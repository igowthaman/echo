// Every watercolor palette lives here. To add one, add an entry: the CSS,
// the settings picker and the database default all read from this list.
// Each pair passes WCAG AA (4.5:1): white on ink, ink on paper, text on wash,
// and the night versions on the dark background.
export const palettes = {
  lagoon:   { label: 'Lagoon',   wash: '#D3E5F0', pigment: '#8DBBD8', ink: '#2D6187', washNight: '#1F3445', inkNight: '#8CC3E6' },
  sage:     { label: 'Sage',     wash: '#DDEBD6', pigment: '#9CC28F', ink: '#3B6936', washNight: '#243523', inkNight: '#9FD293' },
  peony:    { label: 'Peony',    wash: '#F7DDE3', pigment: '#E6A1B2', ink: '#9A3954', washNight: '#3D2229', inkNight: '#F0A7B9' },
  apricot:  { label: 'Apricot',  wash: '#FAE3CF', pigment: '#EEB388', ink: '#95501F', washNight: '#3D2A1B', inkNight: '#F2B98E' },
  wisteria: { label: 'Wisteria', wash: '#E6DFF3', pigment: '#B3A3DA', ink: '#5A4990', washNight: '#2C2640', inkNight: '#BCAEEA' },
} as const;

export type PaletteId = keyof typeof palettes;
export const DEFAULT_PALETTE: PaletteId = 'lagoon';
export const paletteIds = Object.keys(palettes) as PaletteId[];

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && Object.hasOwn(palettes, value);
}

// CSS custom properties for every palette. globals.css maps these onto the
// --wash / --pigment / --ink tokens and swaps in the night values in dark mode.
export function paletteCss(): string {
  const vars = (id: PaletteId) => {
    const p = palettes[id];
    return `--p-wash:${p.wash};--p-pigment:${p.pigment};--p-ink:${p.ink};--p-wash-night:${p.washNight};--p-ink-night:${p.inkNight};`;
  };
  return [
    `:root{${vars(DEFAULT_PALETTE)}}`,
    ...paletteIds.map((id) => `:root[data-palette="${id}"]{${vars(id)}}`),
  ].join('\n');
}
