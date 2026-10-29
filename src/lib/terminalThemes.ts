import type { ITheme } from '@xterm/xterm';

/** 'auto' follows the app's light/dark appearance; explicit values pin the
 *  terminal palette regardless of the shell theme. */
export type TerminalThemeName = 'auto' | 'dark' | 'light';

// Dark palette is the existing hardcoded set from TerminalView. Light keeps the
// same accent hues so dark/light feel like one app in two modes, not two
// unrelated terminals - bg flips to near-white, fg flips to near-black, and the
// ANSI accents stay recognisable while being slightly desaturated where needed
// for legibility on a light background.
export const TERMINAL_THEMES: Record<'dark' | 'light', ITheme> = {
  dark: {
    // Match the app shell's content surface elevation-0 (#0F1320 midnight) so
    // the terminal canvas reads as the editor surface, not a separate panel.
    // selectionBackground is overridden per the live accent in resolveTerminalTheme().
    background: '#0B0B0C',
    foreground: '#EDEDEF',
    cursor: '#EDEDEF',
    cursorAccent: '#0B0B0C',
    selectionBackground: 'rgba(255, 255, 255, 0.22)',
    black: '#171717',
    red: '#EF4444',
    green: '#4ADE80',
    yellow: '#FBBF24',
    blue: '#3B82F6',
    magenta: '#A855F7',
    cyan: '#22D3EE',
    white: '#E5E5E5',
    brightBlack: '#525252',
    brightRed: '#F87171',
    brightGreen: '#86EFAC',
    brightYellow: '#FDE047',
    brightBlue: '#60A5FA',
    brightMagenta: '#C084FC',
    brightCyan: '#67E8F9',
    brightWhite: '#FFFFFF',
  },
  light: {
    // Match the light shell's content surface elevation-0 (#FCFCFE).
    background: '#FFFFFF',
    foreground: '#111111',
    cursor: '#111111',
    cursorAccent: '#FFFFFF',
    selectionBackground: 'rgba(0, 0, 0, 0.16)',
    black: '#171717',
    red: '#DC2626',
    green: '#16A34A',
    yellow: '#CA8A04',
    blue: '#2563EB',
    magenta: '#9333EA',
    cyan: '#0891B2',
    white: '#525252',
    brightBlack: '#404040',
    brightRed: '#EF4444',
    brightGreen: '#22C55E',
    brightYellow: '#EAB308',
    brightBlue: '#3B82F6',
    brightMagenta: '#A855F7',
    brightCyan: '#06B6D4',
    brightWhite: '#171717',
  },
};

export const DEFAULT_TERMINAL_THEME: TerminalThemeName = 'auto';

/** The app shell's current effective appearance. applyThemeMode() writes
 *  data-theme on <html> before first paint, so this is always populated. */
function effectiveAppTheme(): 'dark' | 'light' {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function resolveTerminalTheme(
  name: string | undefined,
  accentHex?: string,
  /** Pre-resolved app appearance for 'auto'. Callers reacting to themeMode
   *  changes should pass this explicitly - child effects can run before the
   *  parent effect that rewrites data-theme, so the DOM read may be stale
   *  during a theme flip. */
  appTheme?: 'dark' | 'light',
  /** Glass theme: draw no background so the wallpaper shows through. The
   *  Terminal must be constructed with allowTransparency for this to apply. */
  glass?: boolean,
): ITheme {
  const resolved: 'dark' | 'light' =
    name === 'light' || name === 'dark' ? name : (appTheme ?? effectiveAppTheme());
  const base = TERMINAL_THEMES[resolved];

  // The UI is monochrome, so the selection stays a neutral tint instead of
  // following the stored accent.
  void accentHex;
  return glass ? { ...base, background: 'rgba(0, 0, 0, 0)' } : base;
}
