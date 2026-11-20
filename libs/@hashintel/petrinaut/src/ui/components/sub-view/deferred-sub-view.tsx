import { useSyncExternalStore } from "react";

import type { SubView } from "./types";

type LoadedParts = Pick<SubView, "component" | "headerAction">;

type DeferredSubViewOptions = Omit<SubView, "component" | "headerAction"> & {
  load: () => Promise<LoadedParts>;
  hasHeaderAction?: boolean;
};

/** Loads optional panel content without delaying its reveal through Suspense. */
export const createDeferredSubView = ({
  load,
  hasHeaderAction = false,
  ...descriptor
}: DeferredSubViewOptions): SubView & { preload: () => void } => {
  let result: { loaded?: LoadedParts; error?: unknown } = {};
  let loading = false;
  const listeners = new Set<() => void>();
  const getSnapshot = () => result;
  const publish = (next: typeof result) => {
    result = next;
    for (const listener of listeners) listener();
  };
  const preload = () => {
    if (loading) return;
    loading = true;
    void load().then(
      (loaded) => publish({ loaded }),
      (error: unknown) => publish({ error }),
    );
  };
  // The first reader to mount starts the load, if no preload did.
  const subscribe = (listener: () => void) => {
    preload();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const useLoaded = () => {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    if ("error" in snapshot) throw snapshot.error;
    return snapshot.loaded;
  };
  const Content = () => {
    const Component = useLoaded()?.component;
    return Component ? <Component /> : null;
  };
  const HeaderAction = () => {
    const Action = useLoaded()?.headerAction;
    return Action ? <Action /> : null;
  };

  return {
    ...descriptor,
    component: Content,
    headerAction: hasHeaderAction ? HeaderAction : undefined,
    preload,
  };
};
