import { useEffect, useSyncExternalStore } from "react";

import type { SubView } from "./types";

type DeferredSubViewOptions = Omit<
  SubView,
  "component" | "renderHeaderAction"
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
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
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
  const useSubView = () => {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    useEffect(preload, []);
    if ("error" in snapshot) throw snapshot.error;
    return snapshot.subView;
  };
  const Content = () => {
    const Component = useSubView()?.component;
    return Component ? <Component /> : null;
  };
  const HeaderAction = () => useSubView()?.renderHeaderAction?.() ?? null;

  return {
    ...descriptor,
    component: Content,
    renderHeaderAction: hasHeaderAction ? () => <HeaderAction /> : undefined,
    preload,
  };
};
