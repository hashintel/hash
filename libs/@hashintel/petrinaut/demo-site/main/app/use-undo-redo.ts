import { useRef, useState } from "react";

import type { SDCPN } from "../../../src/core/types/sdcpn";
import { isSDCPNEqual } from "../../../src/petrinaut";

export type HistoryEntry = {
  sdcpn: SDCPN;
  timestamp: string;
};

const MAX_HISTORY = 50;
const DEBOUNCE_MS = 500;

export function useUndoRedo(initialSDCPN: SDCPN) {
  const historyRef = useRef<HistoryEntry[]>([
    { sdcpn: initialSDCPN, timestamp: new Date().toISOString() },
  ]);
  const currentIndexRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Snapshot of render-visible values derived from the refs.
   * Updated via `bump()` after every mutation so consumers re-render
   * without reading refs during render.
   */
  const [snapshot, setSnapshot] = useState({
    currentIndex: 0,
    historyLength: 1,
  });
  const bump = () =>
    setSnapshot({
      currentIndex: currentIndexRef.current,
      historyLength: historyRef.current.length,
    });

  const canUndo = snapshot.currentIndex > 0;
  const canRedo = snapshot.currentIndex < snapshot.historyLength - 1;

  const pushState = (sdcpn: SDCPN) => {
    const current = historyRef.current[currentIndexRef.current];

    // No-op detection
    if (current && isSDCPNEqual(current.sdcpn, sdcpn)) {
      return;
    }

    // Debounce: coalesce rapid mutations into one entry
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      // Replace the entry at currentIndex (it was a pending debounced entry)
      historyRef.current[currentIndexRef.current] = {
        sdcpn,
        timestamp: new Date().toISOString(),
      };

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
      }, DEBOUNCE_MS);

      bump();
      return;
    }

    // Truncate any redo entries
    historyRef.current = historyRef.current.slice(
      0,
      currentIndexRef.current + 1,
    );

    // Push new entry
    historyRef.current.push({
      sdcpn,
      timestamp: new Date().toISOString(),
    });

    // Enforce max history size
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current = historyRef.current.slice(
        historyRef.current.length - MAX_HISTORY,
      );
    }

    currentIndexRef.current = historyRef.current.length - 1;

    // Start debounce window
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
    }, DEBOUNCE_MS);

    bump();
  };

  const clearDebounce = () => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  };

  const undo = (): SDCPN | null => {
    if (currentIndexRef.current <= 0) {
      return null;
    }
    clearDebounce();
    currentIndexRef.current -= 1;
    bump();
    return historyRef.current[currentIndexRef.current]!.sdcpn;
  };

  const redo = (): SDCPN | null => {
    if (currentIndexRef.current >= historyRef.current.length - 1) {
      return null;
    }
    clearDebounce();
    currentIndexRef.current += 1;
    bump();
    return historyRef.current[currentIndexRef.current]!.sdcpn;
  };

  const goToIndex = (index: number): SDCPN | null => {
    if (index < 0 || index >= historyRef.current.length) {
      return null;
    }
    clearDebounce();
    currentIndexRef.current = index;
    bump();
    return historyRef.current[index]!.sdcpn;
  };

  const reset = (sdcpn: SDCPN) => {
    historyRef.current = [{ sdcpn, timestamp: new Date().toISOString() }];
    currentIndexRef.current = 0;
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    bump();
  };

  return {
    pushState,
    undo,
    redo,
    goToIndex,
    canUndo,
    canRedo,
    history: historyRef,
    currentIndex: snapshot.currentIndex,
    reset,
  };
}
