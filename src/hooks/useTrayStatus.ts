import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTerminalStore } from '../store/terminalStore';

/**
 * Keep the system tray tooltip in step with how many agents are working or
 * waiting for the user. Main window only - detached windows must not fight
 * over the one tray icon.
 */
export function useTrayStatus(enabled: boolean): void {
  const states = useTerminalStore((s) => s.terminalStates);
  const lastSent = useRef('');

  useEffect(() => {
    if (!enabled) return;
    let working = 0;
    let waiting = 0;
    for (const state of states.values()) {
      if (state === 'busy') working += 1;
      else if (state === 'waiting') waiting += 1;
    }
    const key = `${working}:${waiting}`;
    if (key === lastSent.current) return;
    lastSent.current = key;
    // Cosmetic and refreshed on the next state change, so a failure is safe to drop.
    invoke('set_tray_status', { working, waiting }).catch(() => {});
  }, [enabled, states]);
}
