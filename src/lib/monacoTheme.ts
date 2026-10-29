import type * as Monaco from 'monaco-editor';
import { useAppStore } from '../store/appStore';
import { resolveAppTheme, prefersLightScheme } from './appTheme';

export const EDITOR_THEME_DARK = 'agentdeck-dark';
export const EDITOR_THEME_LIGHT = 'agentdeck-light';

/**
 * Editor themes that draw no background of their own, so the editor sits on
 * whatever surface the app paints (solid, or the glass theme's wallpaper) and
 * shows nothing but code. Syntax colours come from Monaco's own base themes.
 * Popups (suggest, hover) stay solid so they remain readable over a wallpaper.
 */
export function defineAgentdeckThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme(EDITOR_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#00000000',
      'editorGutter.background': '#00000000',
      'minimap.background': '#00000000',
      'editor.lineHighlightBackground': '#ffffff0a',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#ffffff3d',
      'editorLineNumber.activeForeground': '#ffffffa6',
      'editor.selectionBackground': '#ffffff2e',
      'editor.inactiveSelectionBackground': '#ffffff1a',
      'editorCursor.foreground': '#ededef',
      'editorIndentGuide.background1': '#ffffff12',
      'editorIndentGuide.activeBackground1': '#ffffff2e',
      'scrollbarSlider.background': '#ffffff1f',
      'scrollbarSlider.hoverBackground': '#ffffff33',
      'scrollbarSlider.activeBackground': '#ffffff40',
      'editorWidget.background': '#18181b',
      'editorWidget.border': '#ffffff26',
      'editorSuggestWidget.background': '#18181b',
      'editorSuggestWidget.border': '#ffffff26',
      'editorSuggestWidget.selectedBackground': '#ffffff1a',
      'editorHoverWidget.background': '#18181b',
      'editorHoverWidget.border': '#ffffff26',
      'editorError.foreground': '#00000000',
      'editorWarning.foreground': '#00000000',
      'editorInfo.foreground': '#00000000',
      'editorHint.foreground': '#00000000',
    },
  });
  monaco.editor.defineTheme(EDITOR_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#00000000',
      'editorGutter.background': '#00000000',
      'minimap.background': '#00000000',
      'editor.lineHighlightBackground': '#0000000a',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#00000047',
      'editorLineNumber.activeForeground': '#000000a6',
      'editor.selectionBackground': '#00000026',
      'editor.inactiveSelectionBackground': '#00000014',
      'editorCursor.foreground': '#111111',
      'editorIndentGuide.background1': '#0000001a',
      'editorIndentGuide.activeBackground1': '#00000040',
      'scrollbarSlider.background': '#00000024',
      'scrollbarSlider.hoverBackground': '#00000038',
      'scrollbarSlider.activeBackground': '#00000047',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#00000026',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#00000026',
      'editorSuggestWidget.selectedBackground': '#0000000f',
      'editorHoverWidget.background': '#ffffff',
      'editorHoverWidget.border': '#00000026',
      'editorError.foreground': '#00000000',
      'editorWarning.foreground': '#00000000',
      'editorInfo.foreground': '#00000000',
      'editorHint.foreground': '#00000000',
    },
  });
}

/** Theme name for the app's current light/dark appearance. */
export function useEditorTheme(): string {
  const mode = useAppStore((s) => s.themeMode);
  const prefersLight = typeof window.matchMedia === 'function' && prefersLightScheme();
  return resolveAppTheme(mode, prefersLight) === 'light' ? EDITOR_THEME_LIGHT : EDITOR_THEME_DARK;
}

/** Options that strip the editor down to the code itself. */
export const CODE_ONLY_OPTIONS: Monaco.editor.IEditorOptions = {
  // No squiggles or error marks: the editor shows code, not diagnostics.
  renderValidationDecorations: 'off',
  renderLineHighlight: 'none',
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  glyphMargin: false,
  folding: false,
  lineDecorationsWidth: 8,
  lineNumbersMinChars: 3,
  stickyScroll: { enabled: false },
  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
};
