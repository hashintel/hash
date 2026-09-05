import { lazy, Suspense } from "react";

import type { SubView } from "./types";

type DeferredSubViewOptions = Omit<
  SubView,
  "component" | "renderHeaderAction"
> & {
  load: () => Promise<SubView>;
  hasHeaderAction?: boolean;
};

/**
 * Keeps an optional subview behind a bundle boundary while preserving the
 * synchronous descriptor required by the panel layout.
 */
export const createDeferredSubView = ({
  load,
  hasHeaderAction = false,
  ...descriptor
}: DeferredSubViewOptions): SubView => {
  const DeferredContent = lazy(async () => {
    const subView = await load();
    return { default: subView.component };
  });
  const Content = () => (
    <Suspense fallback={null}>
      <DeferredContent />
    </Suspense>
  );

  if (!hasHeaderAction) {
    return { ...descriptor, component: Content };
  }

  const DeferredHeaderAction = lazy(async () => {
    const subView = await load();
    const HeaderAction = () => subView.renderHeaderAction?.() ?? null;
    return { default: HeaderAction };
  });

  return {
    ...descriptor,
    component: Content,
    renderHeaderAction: () => (
      <Suspense fallback={null}>
        <DeferredHeaderAction />
      </Suspense>
    ),
  };
};
