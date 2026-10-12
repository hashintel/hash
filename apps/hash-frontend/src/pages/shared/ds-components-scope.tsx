import { Box } from "@mui/material";
import { useRef } from "react";

import { PortalContainerContext } from "@hashintel/ds-components";

import type { SxProps, Theme } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

/**
 * Scopes a subtree for `@hashintel/ds-components`: `.hash-ds-root` is where
 * the design system's token variables and preflight apply (see the app's
 * `panda.config.ts`), and the portal context makes ds dropdowns render inside
 * that scope — portalled to `document.body` they would sit outside it, where
 * the token variables don't resolve.
 *
 * The preflight resets everything inside the scope, so wrap only ds-component
 * islands, not MUI-styled siblings.
 */
export const DsComponentsScope: FunctionComponent<{
  children: ReactNode;
  sx?: SxProps<Theme>;
}> = ({ children, sx }) => {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <PortalContainerContext.Provider value={rootRef}>
      <Box
        ref={rootRef}
        className="hash-ds-root"
        // The scoped ds globals paint the document surface (`bg: neutral.s00`)
        // on every `.hash-ds-root`, via a selector the @layer polyfill boosts
        // to ID-level specificity — inline style is what reliably outranks it.
        // An island sits transparently on whatever hosts it.
        style={{ background: "transparent" }}
        sx={sx}
      >
        {children}
      </Box>
    </PortalContainerContext.Provider>
  );
};
