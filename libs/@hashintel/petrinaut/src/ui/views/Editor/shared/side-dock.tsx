import { createContext, use, useState, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

type SideDockValue = {
  container: HTMLDivElement | null;
  setContainer: (element: HTMLDivElement | null) => void;
};

const SideDockContext = createContext<SideDockValue | undefined>(undefined);

/**
 * Holds the dock column's element for the panels that render into it. Wraps
 * the workspace row, so the column and every panel that can dock share it.
 */
export const SideDockProvider = ({ children }: { children: ReactNode }) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <SideDockContext value={{ container, setContainer }}>
      {children}
    </SideDockContext>
  );
};

// Not positioned: a panel floating out of the column positions against the
// workspace row, the column's containing block, while a docked panel is laid
// out in the column and gives it its width.
const columnStyle = css({
  display: "flex",
  flexShrink: 0,
  minWidth: "[0]",
  minHeight: "[0]",
  height: "full",
});

/**
 * The column between the workspace and the AI assistant that docked panels
 * render into. Empty, it takes no width.
 */
export const SideDockColumn = () => {
  const dock = use(SideDockContext);
  if (dock === undefined) {
    throw new Error("SideDockColumn renders inside a SideDockProvider.");
  }
  // The setter is called from the ref callback, after render: passing it to
  // `ref` directly makes the compiler read the context value as a ref.
  return (
    <div
      ref={(element) => dock.setContainer(element)}
      data-side-dock
      className={columnStyle}
    />
  );
};

/**
 * The dock column's element: `undefined` outside a provider, where a panel
 * renders in place, and `null` until the column has mounted.
 */
export const useSideDockContainer = (): HTMLDivElement | null | undefined =>
  use(SideDockContext)?.container;
