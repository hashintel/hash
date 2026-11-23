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
 * Keeps React Flow's selection keys in step with the keyboard.
 *
 * `multiSelectionActive` follows whether Cmd (macOS) or Ctrl (elsewhere) is
 * held, read from the modifier flags of every key and pointer event. The
 * canvas passes `multiSelectionKeyCode={null}` so React Flow's own tracking
 * stays out: it matches only an exact set of held keys, so pressing or
 * releasing Shift around the modifier switches it off.
 *
 * The selection key is released when the page missed its keyup. A system
 * shortcut that holds Shift, such as the one that takes a screenshot, gives
 * the page the keydown and keeps the keyup, and React Flow then draws a
 * selection box from every press until Shift is pressed again. A press that
 * says Shift is up while the page last saw it go down sends the keyup the
 * page did not get, before the press sets the modifier.
 */
export const useSelectionKeys = (mac: boolean) => {
  const flowStore = useStoreApi();

  useEffect(() => {
    let shiftSeenDown = false;
    const sync = (event: KeyboardEvent | PointerEvent) => {
      const active = mac ? event.metaKey : event.ctrlKey;
      if (flowStore.getState().multiSelectionActive !== active) {
        flowStore.setState({ multiSelectionActive: active });
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        shiftSeenDown = event.type === "keydown";
      }
      sync(event);
    };
    const onPress = (event: PointerEvent) => {
      if (shiftSeenDown && !event.shiftKey) {
        window.dispatchEvent(
          new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft" }),
        );
      }
      sync(event);
    };
    const reset = () => {
      shiftSeenDown = false;
      flowStore.setState({ multiSelectionActive: false });
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("blur", reset);
    };
  }, [flowStore, mac]);
};
