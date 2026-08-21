import { useScrollLock } from "@hashintel/ds-components";

import { useSlideStack } from "../../../../pages/shared/slide-stack";

import type { ReactNode } from "react";

/**
 * Lock scrolling outside when a Grid editor overlay is open.
 *
 * Note that because the EditBarContext is set at the Layout level, it passes the `body` as the scrollable component that should be locked.
 * This doesn't apply when a grid editor is open in a drawer/slide with scroll, which _won't_ have its scroll locked.
 *
 * Fixing this requires being able to lock _both_ the body and the slide scroll, which means getting the slide element into this component somehow.
 * Or having some global context tracking which slide is open, or finding it via classes.
 *
 * The type editor slide stack is also relying on useScrollLock to lock the body.
 * The entity editor slide stack doesn't.
 *
 * @todo make the slide stacks consistent when this becomes an issue, and lock the slide scroll.
 */
export const ScrollLockWrapper = ({
  children,
}: {
  children: ReactNode | Promise<ReactNode>;
}) => {
  const { currentSlideRef } = useSlideStack();

  useScrollLock(true, currentSlideRef?.current ?? document.body);

  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
};
