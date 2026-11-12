import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

/** The panel floats over the canvas's right edge, so opening it doesn't resize the canvas or move what's on it. */
export const sidePanelWidth = 384;

const panel = css({
  position: "absolute",
  zIndex: "docked",
  top: "0",
  right: "0",
  bottom: "0",
  display: "flex",
  flexDirection: "column",
  gap: "8",
  width: "[384px]",
  p: "4",
  bg: "bgSolid.min",
  overflowY: "auto",
  borderLeftWidth: "1px",
  borderLeftStyle: "solid",
  borderLeftColor: "bd.subtle",
});

const heading = css({
  m: "0",
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
});

const section = css({ display: "flex", flexDirection: "column", gap: "2" });

/** The panel beside the canvas for what's selected on it, e.g. a step in the editor or in a run. */
export const SidePanel = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <aside className={panel} aria-label={label}>
    {children}
  </aside>
);

/** The name of what the panel shows, at its top. */
export const PanelTitle = ({ children }: { children: ReactNode }) => (
  <h2 className={heading}>{children}</h2>
);

export const PanelSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className={section}>
    <h3 className={heading}>{title}</h3>
    {children}
  </section>
);
