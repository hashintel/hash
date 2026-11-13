import { css, cx } from "@hashintel/ds-helpers/css";

import { sidePanelFrame } from "./side-panel-frame";

import type { ReactNode } from "react";

/** The panel floats over the canvas's right edge, so opening it doesn't resize the canvas or move what's on it. */
export const sidePanelWidth = 384;

const panel = css({
  display: "flex",
  flexDirection: "column",
  gap: "8",
  p: "4",
  overflowY: "auto",
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
  inert,
  children,
}: {
  label: string;
  /** Out of reach, e.g. under what opened in its place. */
  inert?: boolean;
  children: ReactNode;
}) => (
  <aside className={cx(sidePanelFrame, panel)} aria-label={label} inert={inert}>
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
