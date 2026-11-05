import type {
  DocChangeEvent,
  PetrinautDocHandle,
  PetrinautPatch,
  ReadableStore,
  SDCPN,
} from "@hashintel/petrinaut-core";

const isVisualizerEdit = ({ op, path, value }: PetrinautPatch) => {
  const placePath =
    path[0] === "subnets" && typeof path[1] === "number" ? path.slice(2) : path;
  return (
    op === "replace" &&
    typeof value === "string" &&
    placePath.length === 3 &&
    placePath[0] === "places" &&
    typeof placePath[1] === "number" &&
    placePath[2] === "visualizerCode"
  );
};

/** Delays UI snapshots; the source document receives every edit synchronously. */
export const createVisualizerDefinitionStore = (
  source: ReadableStore<SDCPN>,
  handle: Pick<PetrinautDocHandle, "subscribe">,
): ReadableStore<SDCPN> & { flush: () => void } => {
  let snapshot = source.get();
  let unsubscribe: (() => void) | undefined;
  let delay: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(value: SDCPN) => void>();
  const cancel = () => {
    clearTimeout(delay);
    clearTimeout(deadline);
    delay = undefined;
    deadline = undefined;
  };
  const flush = () => {
    cancel();
    const next = source.get();
    if (snapshot === next) return;
    snapshot = next;
    for (const listener of listeners) listener(snapshot);
  };
  const changed = (event: DocChangeEvent) => {
    if (
      event.source !== "local" ||
      !event.patches?.length ||
      !event.patches.every(isVisualizerEdit)
    ) {
      flush();
      return;
    }
    clearTimeout(delay);
    delay = setTimeout(flush, 120);
    deadline ??= setTimeout(flush, 500);
  };

  return {
    get: () => (listeners.size > 0 ? snapshot : source.get()),
    flush,
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        snapshot = source.get();
        unsubscribe = handle.subscribe(changed);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribe?.();
          unsubscribe = undefined;
          cancel();
        }
      };
    },
  };
};
