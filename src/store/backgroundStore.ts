import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * Glass theme + wallpaper. Kept out of appStore on purpose: the wallpaper is a
 * data URL of a few hundred KB, and appStore rewrites its whole persisted blob
 * on every change. This store has its own localStorage key and is only written
 * when one of these settings changes.
 */
interface BackgroundState {
  /** Translucent glass surfaces over the wallpaper (terminals included). */
  glass: boolean;
  /** Downscaled JPEG data URL, or null for the built-in neutral backdrop. */
  image: string | null;
  /** 0..0.85 veil laid over the wallpaper to keep text readable. */
  dim: number;
  /** Blur of the wallpaper itself, in px. */
  blur: number;
  /** 0.15..0.9 opacity of the main surfaces; lower shows more wallpaper. */
  panelOpacity: number;
  setGlass: (v: boolean) => void;
  setImage: (dataUrl: string | null) => void;
  setDim: (v: number) => void;
  setBlur: (v: number) => void;
  setPanelOpacity: (v: number) => void;
}

// localStorage can throw (private mode, quota). The wallpaper then simply
// doesn't persist, but the session keeps working.
const safeStorage: StateStorage = {
  getItem: (name) => {
    try { return localStorage.getItem(name); } catch { return null; }
  },
  setItem: (name, value) => {
    try { localStorage.setItem(name, value); } catch { /* quota or blocked: keep in-memory state */ }
  },
  removeItem: (name) => {
    try { localStorage.removeItem(name); } catch { /* nothing to remove */ }
  },
};

export const useBackgroundStore = create<BackgroundState>()(
  persist(
    (set) => ({
      glass: false,
      image: null,
      dim: 0.35,
      blur: 0,
      panelOpacity: 0.55,
      setGlass: (glass) => set({ glass }),
      // Choosing a wallpaper only makes sense with glass on, so turn it on.
      setImage: (image) => set(image ? { image, glass: true } : { image: null }),
      setDim: (dim) => set({ dim }),
      setBlur: (blur) => set({ blur }),
      setPanelOpacity: (panelOpacity) => set({ panelOpacity }),
    }),
    {
      name: 'agentdeck-background',
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
