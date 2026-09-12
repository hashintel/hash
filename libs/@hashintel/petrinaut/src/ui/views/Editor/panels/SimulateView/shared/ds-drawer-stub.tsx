/**
 * The ds `Drawer` compound for the drawer suites' `vi.mock` of
 * `@hashintel/ds-components`: the Ark dialog needs a portal and focus
 * management jsdom cannot give it, so the parts render their children in
 * place.
 */
import type { ReactNode } from "react";

export const Drawer = Object.assign(
  ({
    children,
    "aria-label": ariaLabel,
  }: {
    children: ReactNode;
    "aria-label"?: string;
  }) => (
    <div role="dialog" aria-label={ariaLabel}>
      {children}
    </div>
  ),
  {
    Header: ({ children }: { children: ReactNode }) => (
      <header>{children}</header>
    ),
    Body: ({ children }: { children: ReactNode }) => <main>{children}</main>,
    Footer: ({ actions }: { actions: ReactNode }) => <footer>{actions}</footer>,
  },
);
