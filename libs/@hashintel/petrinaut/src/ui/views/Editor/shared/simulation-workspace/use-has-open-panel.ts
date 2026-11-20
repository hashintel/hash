import { useSyncExternalStore } from "react";

/** A panel that is shown and is not on its way out. */
const openPanel =
  "[data-simulation-panel]:not([hidden]):not([data-closing=true])";

const hasOpenPanel = (slot: HTMLElement | null): boolean => {
  for (const child of slot?.children ?? []) {
    if (child.matches(openPanel)) {
      return true;
    }
  }
  return false;
};

/** Has `observer` hear of a panel that arrives or leaves, and of one that hides or starts to close. */
const observePanels = (observer: MutationObserver, slot: HTMLElement) => {
  observer.disconnect();
  observer.observe(slot, { childList: true });
  for (const panel of slot.children) {
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ["hidden", "data-closing"],
    });
  }
};

const subscribeToPanels = (
  slot: HTMLElement | null,
  onChange: () => void,
): (() => void) => {
  if (!slot) {
    return () => {};
  }
  const observer = new MutationObserver((_records, self) => {
    // The change may have brought a panel, which is not observed yet.
    observePanels(self, slot);
    onChange();
  });
  observePanels(observer, slot);

  return () => observer.disconnect();
};

/**
 * Whether the slot of a simulation workspace holds an open panel.
 *
 * Panels are rendered into the slot from anywhere below the workspace, so
 * the workspace learns of one from the slot's elements: they are the
 * external store, read on every render and again whenever a panel arrives,
 * leaves, hides or starts to close.
 */
export const useHasOpenPanel = (slot: HTMLElement | null): boolean =>
  useSyncExternalStore(
    (onChange) => subscribeToPanels(slot, onChange),
    () => hasOpenPanel(slot),
    () => false,
  );
