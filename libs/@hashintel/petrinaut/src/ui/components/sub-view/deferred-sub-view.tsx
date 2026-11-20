import { useSyncExternalStore } from "react";

import type { SubView } from "./types";

type DeferredSubViewOptions = Omit<
  SubView,
  "component" | "headerAction" | "renderHeaderAction"
> & {
  load: () => Promise<SubView>;
  hasHeaderAction?: boolean;
};

/** Loads optional panel content without delaying its reveal through Suspense. */
export const createDeferredSubView = ({
  load,
  hasHeaderAction = false,
  ...descriptor
}: DeferredSubViewOptions): SubView & { preload: () => void } => {
  let result: { subView?: SubView; error?: unknown } = {};
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
      (subView) => publish({ subView }),
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
  const useSubView = () => {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    if ("error" in snapshot) throw snapshot.error;
    return snapshot.subView;
  };
  const Content = () => {
    const Component = useSubView()?.component;
    return Component ? <Component /> : null;
  };
  const HeaderAction = () => {
    const subView = useSubView();
    const Loaded = subView?.headerAction;
    return Loaded ? <Loaded /> : (subView?.renderHeaderAction?.() ?? null);
  };

  return {
    ...descriptor,
    component: Content,
    headerAction: hasHeaderAction ? HeaderAction : undefined,
    preload,
  };
};
