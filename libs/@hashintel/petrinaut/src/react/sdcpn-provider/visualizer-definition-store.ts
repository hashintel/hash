import type { Place, ReadableStore, SDCPN } from "@hashintel/petrinaut-core";

const sameExcept = <Value extends object>(
  previous: Value,
  next: Value,
  ignored: (keyof Value)[],
) => {
  const keys = new Set([
    ...Object.keys(previous),
    ...Object.keys(next),
  ] as (keyof Value)[]);
  return [...keys].every(
    (key) => ignored.includes(key) || Object.is(previous[key], next[key]),
  );
};

const samePlacesExceptCode = (previous: Place[], next: Place[]) =>
  previous === next ||
  (previous.length === next.length &&
    previous.every((place, index) => {
      const updated = next[index];
      return (
        updated !== undefined &&
        (place === updated ||
          (place.visualizerCode !== undefined &&
            updated.visualizerCode !== undefined &&
            sameExcept(place, updated, ["visualizerCode"])))
      );
    }));

const onlyVisualizerCodeChanged = (previous: SDCPN, next: SDCPN) => {
  if (
    !sameExcept(previous, next, ["places", "subnets"]) ||
    !samePlacesExceptCode(previous.places, next.places)
  )
    return false;
  if (previous.subnets === next.subnets) return true;
  const before = previous.subnets ?? [];
  const after = next.subnets ?? [];
  return (
    before.length === after.length &&
    before.every((subnet, index) => {
      const updated = after[index];
      return (
        updated !== undefined &&
        sameExcept(subnet, updated, ["places"]) &&
        samePlacesExceptCode(subnet.places, updated.places)
      );
    })
  );
};

/** Delays UI snapshots; the source document receives every edit synchronously. */
export const createVisualizerDefinitionStore = (
  source: ReadableStore<SDCPN>,
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
  const changed = (next: SDCPN) => {
    if (!onlyVisualizerCodeChanged(snapshot, next)) {
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
        unsubscribe = source.subscribe(changed);
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
