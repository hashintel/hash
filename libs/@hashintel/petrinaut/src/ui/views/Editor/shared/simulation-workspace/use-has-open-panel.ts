import { useSyncExternalStore } from "react";

/** A panel that is shown and is not on its way out. */
const openPanel =
  "[data-simulation-panel]:not([hidden]):not([data-closing=true])";

const hasOpenPanel = (container: HTMLElement | null): boolean => {
  for (const child of container?.children ?? []) {
    if (child.matches(openPanel)) {
      return true;
    }
  }
  return false;
};

/** Has `observer` hear of a panel that arrives or leaves, and of one that hides or starts to close. */
const observePanels = (observer: MutationObserver, container: HTMLElement) => {
  observer.disconnect();
  observer.observe(container, { childList: true });
  for (const panel of container.children) {
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ["hidden", "data-closing"],
    });
  }
};

const subscribeToPanels = (
  container: HTMLElement | null,
  onChange: () => void,
): (() => void) => {
  if (!container) {
    return () => {};
  }
  const observer = new MutationObserver((_records, self) => {
    // The change may have brought a panel, which is not observed yet.
    observePanels(self, container);
    onChange();
  });
  observePanels(observer, container);

  return () => observer.disconnect();
};

/**
 * Whether the container of a simulation workspace's panels holds an open
 * one.
 *
 * Panels are rendered into the container from anywhere below the workspace,
 * so the workspace learns of one from the container's elements: they are the
 * external store, read on every render and again whenever a panel arrives,
 * leaves, hides or starts to close.
 */
export const useHasOpenPanel = (container: HTMLElement | null): boolean =>
  useSyncExternalStore(
    (onChange) => subscribeToPanels(container, onChange),
    () => hasOpenPanel(container),
    () => false,
  );
