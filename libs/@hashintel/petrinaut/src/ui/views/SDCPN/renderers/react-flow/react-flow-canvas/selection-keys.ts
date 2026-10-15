import { useStoreApi } from "@xyflow/react";
import { useEffect } from "react";

export const isMac =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

/**
 * Shift draws a selection box, alone or with the multi-selection modifier.
 * React Flow matches a key code only while exactly its keys are held, so
 * Shift alone stops matching once the modifier is down first.
 */
export const getSelectionKeyCode = (mac: boolean): string[] => [
  "Shift",
  `Shift+${mac ? "Meta" : "Control"}`,
];

export const selectionKeyCode = getSelectionKeyCode(isMac);

/**
 * Keeps React Flow's `multiSelectionActive` equal to whether Cmd (macOS) or
 * Ctrl (elsewhere) is held, read from the modifier flags of every key and
 * pointer event. The canvas passes `multiSelectionKeyCode={null}` so React
 * Flow's own tracking stays out: it matches only an exact set of held keys,
 * so pressing or releasing Shift around the modifier switches it off.
 */
export const useMultiSelectionModifier = (mac: boolean) => {
  const flowStore = useStoreApi();

  useEffect(() => {
    const sync = (event: KeyboardEvent | PointerEvent) => {
      const active = mac ? event.metaKey : event.ctrlKey;
      if (flowStore.getState().multiSelectionActive !== active) {
        flowStore.setState({ multiSelectionActive: active });
      }
    };
    const reset = () => flowStore.setState({ multiSelectionActive: false });

    window.addEventListener("keydown", sync, true);
    window.addEventListener("keyup", sync, true);
    window.addEventListener("pointerdown", sync, true);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", sync, true);
      window.removeEventListener("keyup", sync, true);
      window.removeEventListener("pointerdown", sync, true);
      window.removeEventListener("blur", reset);
    };
  }, [flowStore, mac]);
};
