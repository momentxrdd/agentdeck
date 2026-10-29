import { useRef, type ChangeEvent } from 'react';
import { useAppStore, DEFAULT_ACCENT_COLOR } from '../../../store/appStore';
import { useBackgroundStore } from '../../../store/backgroundStore';
import { imageFileToDataUrl } from '../../../lib/background';
import { toast } from '../../../store/toastStore';
import { PageHeader, PageSection, SettingRow, Segmented, Toggle } from '../SettingRow';
import { registerSetting } from '../index';

const cat = { group: 'appearance-behavior', page: 'appearance' } as const;
registerSetting({ category: cat, id: 'theme',       label: 'Theme',          keywords: ['dark', 'light', 'auto'] });
registerSetting({ category: cat, id: 'density',     label: 'Density',        keywords: ['compact', 'comfortable', 'spacious'] });
registerSetting({ category: cat, id: 'colorful-folders', label: 'Colorful folder icons', keywords: ['folder', 'icons', 'material', 'color', 'tree'] });
registerSetting({ category: cat, id: 'glass',       label: 'Glass theme',    keywords: ['transparent', 'translucent', 'blur', 'frosted'] });
registerSetting({ category: cat, id: 'background-image', label: 'Background image', keywords: ['wallpaper', 'picture', 'photo', 'glass', 'terminal'] });
registerSetting({ category: cat, id: 'accent',     label: 'Accent color',   keywords: ['hex', 'color', 'stripe'] });
registerSetting({ category: cat, id: 'font-scale',  label: 'UI font scale',  keywords: ['zoom', 'size', 'font'] });
registerSetting({ category: cat, id: 'reduce-motion', label: 'Reduce motion',keywords: ['animation', 'a11y', 'accessibility'] });
registerSetting({ category: cat, id: 'status-bar',    label: 'Status bar',     keywords: ['minimal', 'chrome', 'bottom', 'hide'] });
registerSetting({ category: cat, id: 'tab-activity',  label: 'Tab activity',   keywords: ['minimal', 'indicator', 'dot', 'busy', 'hide'] });
registerSetting({ category: cat, id: 'compact-titlebar', label: 'Compact title bar', keywords: ['minimal', 'brand', 'chrome', 'hide'] });

// Apple system palette: blue, green, purple, orange, red.
const ACCENT_PRESETS = ['#007AFF', '#34C759', '#AF52DE', '#FF9500', '#FF3B30'];

export default function AppearancePage() {
  const themeMode = useAppStore((s) => s.themeMode);
  const uiDensity = useAppStore((s) => s.uiDensity);
  const colorfulFolderIcons = useAppStore((s) => s.colorfulFolderIcons);
  const accentColorHex = useAppStore((s) => s.accentColorHex);
  const uiFontScale = useAppStore((s) => s.uiFontScale);
  const uiReduceMotion = useAppStore((s) => s.uiReduceMotion);
  const showStatusBar = useAppStore((s) => s.showStatusBar);
  const showTabActivity = useAppStore((s) => s.showTabActivity);
  const compactTitleBar = useAppStore((s) => s.compactTitleBar);
  const {
    setThemeMode, setUiDensity, setColorfulFolderIcons, setAccentColorHex, setUiFontScale, setUiReduceMotion,
    setShowStatusBar, setShowTabActivity, setCompactTitleBar,
  } = useAppStore.getState();

  const bg = useBackgroundStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onPickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    imageFileToDataUrl(file)
      .then((url) => useBackgroundStore.getState().setImage(url))
      .catch((err) => toast.error('Could not use that image', err instanceof Error ? err.message : String(err)));
  };

  return (
    <div>
      <PageHeader title="Appearance" description="Theme, density, accent color, UI font." />

      <PageSection title="Theme">
        <SettingRow label="Theme">
          <Segmented
            value={themeMode}
            onChange={setThemeMode}
            options={[
              { value: 'dark',  label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'auto',  label: 'Follow system' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Density" description="Row spacing across the app.">
          <Segmented
            value={uiDensity}
            onChange={setUiDensity}
            options={[
              { value: 'compact',     label: 'Compact' },
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'spacious',    label: 'Spacious' },
            ]}
          />
        </SettingRow>
        <SettingRow
          label="Colorful folder icons"
          description="When off, all folders use one yellow icon (matches the sketch). When on, folders like .git, node_modules, docs get material-icon-theme's per-name colors."
        >
          <Toggle value={colorfulFolderIcons} onChange={setColorfulFolderIcons} />
        </SettingRow>
        <SettingRow label="Accent color">
          <div className="flex gap-2 items-center">
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setAccentColorHex(c)}
                style={{ background: c }}
                className={`w-5 h-5 rounded-full transition-transform ${
                  accentColorHex.toLowerCase() === c.toLowerCase()
                    ? 'ring-2 ring-[rgb(var(--text-primary))] ring-offset-2 ring-offset-[var(--elevation-0)] scale-110'
                    : 'hover:scale-105'
                }`}
                aria-label={`Accent ${c}`}
              />
            ))}
            <input
              type="color"
              value={accentColorHex}
              onChange={(e) => setAccentColorHex(e.target.value)}
              className="w-7 h-6 bg-transparent border-0 rounded cursor-pointer"
              aria-label="Custom accent color"
            />
            <button
              onClick={() => setAccentColorHex(DEFAULT_ACCENT_COLOR)}
              className="text-[11px] text-text-tertiary hover:text-text-secondary px-2"
            >
              Reset
            </button>
          </div>
        </SettingRow>
        <SettingRow label="UI font scale" description={`${uiFontScale.toFixed(2)}x - affects body text only.`}>
          <input
            type="range"
            min="0.85"
            max="1.25"
            step="0.05"
            value={uiFontScale}
            onChange={(e) => setUiFontScale(parseFloat(e.target.value))}
            className="w-40 accent-accent-primary"
          />
        </SettingRow>
      </PageSection>

      <PageSection title="Glass and background" description="Translucent panels over a wallpaper. The terminals become see-through too.">
        <SettingRow label="Glass theme" description="Panels, menus and terminals let the background show through.">
          <Toggle value={bg.glass} onChange={bg.setGlass} label="Glass theme" />
        </SettingRow>
        <SettingRow label="Background image" description="Shown behind everything when the glass theme is on. Stored on this device only." align="start">
          <div className="flex flex-col items-end gap-2">
            {bg.image && (
              <img
                src={bg.image}
                alt="Current background"
                className="w-40 h-24 object-cover rounded-md ring-1 ring-seam-strong"
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 h-7 text-[12px] rounded-md ring-1 ring-seam-strong text-text-primary hover:bg-fill-hover"
              >
                {bg.image ? 'Change…' : 'Choose image…'}
              </button>
              {bg.image && (
                <button
                  onClick={() => bg.setImage(null)}
                  className="px-3 h-7 text-[12px] rounded-md text-text-secondary hover:bg-fill-hover"
                >
                  Remove
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
          </div>
        </SettingRow>
        <SettingRow label="Panel opacity" description={`${Math.round(bg.panelOpacity * 100)}% - lower shows more of the background.`}>
          <input
            type="range" min="0.15" max="0.9" step="0.05"
            value={bg.panelOpacity}
            onChange={(e) => bg.setPanelOpacity(parseFloat(e.target.value))}
            className="w-40 accent-accent-primary"
            aria-label="Panel opacity"
          />
        </SettingRow>
        <SettingRow label="Image dimming" description={`${Math.round(bg.dim * 100)}% - keeps text readable on bright images.`}>
          <input
            type="range" min="0" max="0.85" step="0.05"
            value={bg.dim}
            onChange={(e) => bg.setDim(parseFloat(e.target.value))}
            className="w-40 accent-accent-primary"
            aria-label="Image dimming"
          />
        </SettingRow>
        <SettingRow label="Image blur" description={`${bg.blur}px`}>
          <input
            type="range" min="0" max="40" step="2"
            value={bg.blur}
            onChange={(e) => bg.setBlur(parseInt(e.target.value, 10))}
            className="w-40 accent-accent-primary"
            aria-label="Image blur"
          />
        </SettingRow>
      </PageSection>

      <PageSection title="Accessibility">
        <SettingRow label="Reduce motion" description="Disables tab-pulse, shimmer, and panel transitions.">
          <Toggle value={uiReduceMotion} onChange={setUiReduceMotion} label="Reduce motion" />
        </SettingRow>
      </PageSection>

      <PageSection title="Interface">
        <SettingRow label="Status bar" description="Show the bottom status bar (terminal counts, model, version).">
          <Toggle value={showStatusBar} onChange={setShowStatusBar} label="Status bar" />
        </SettingRow>
        <SettingRow label="Tab activity indicators" description="Show the busy dot and working shimmer on tabs.">
          <Toggle value={showTabActivity} onChange={setShowTabActivity} label="Tab activity indicators" />
        </SettingRow>
        <SettingRow label="Compact title bar" description="Hide the centered product name to free up the drag area.">
          <Toggle value={compactTitleBar} onChange={setCompactTitleBar} label="Compact title bar" />
        </SettingRow>
      </PageSection>
    </div>
  );
}
