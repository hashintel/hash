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
 * Releases React Flow's selection key when the page missed its keyup. A
 * system shortcut that holds Shift, such as the one that takes a screenshot,
 * gives the page the keydown and keeps the keyup, and React Flow then draws
 * a selection box from every press until Shift is pressed again. A press
 * that says Shift is up while the page last saw it go down sends the keyup
 * the page did not get.
 */
export const useSelectionKeyRelease = () => {
  useEffect(() => {
    let shiftSeenDown = false;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        shiftSeenDown = event.type === "keydown";
      }
    };
    const onPress = (event: PointerEvent) => {
      if (shiftSeenDown && !event.shiftKey) {
        window.dispatchEvent(
          new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft" }),
        );
      }
    };
    const forget = () => {
      shiftSeenDown = false;
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("blur", forget);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("blur", forget);
    };
  }, []);
};

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
