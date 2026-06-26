import { useRef } from "react";

import { PortalContainerContext } from "@hashintel/ds-components";

import { getLayoutWithSidebar } from "../../../shared/layout";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";
import { AppShell } from "../../../vct/supply-chain/app-shell";
import { useActiveWorkspace } from "../../shared/workspace-context";

import type { ReactElement, ReactNode } from "react";

/**
 * Layout shared by every `/supply-chain/*` page.
 *
 * The subtree is wrapped in `.hash-ds-root` so the ds-components Panda tokens
 * resolve, and that element is supplied as the `PortalContainerContext` so ds
 * and Ark overlays (dialogs, tooltips, selects) portal *inside* the token
 * scope rather than at `document.body`.
 *
 * `AppShell` is keyed by the active web so switching workspace remounts it and
 * reloads the product/site registry for the new scope.
 */
const SupplyChainShell = ({ children }: { children: ReactNode }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { activeWorkspaceWebId } = useActiveWorkspace();

  return (
    <PortalContainerContext.Provider value={rootRef}>
      {/*
        Bound the ds scope to the viewport height below hash's global header so
        the ported AppShell (which fills this box with `height:100%`) can scroll
        its content pane internally instead of overflowing the page. This is the
        host-side counterpart to the standalone tool's `100dvh` `.vct-root`.
      */}
      <div
        ref={rootRef}
        className="hash-ds-root"
        style={{
          height: `calc(100vh - ${HEADER_HEIGHT}px)`,
          overflow: "hidden",
        }}
      >
        {activeWorkspaceWebId ? (
          <AppShell
            key={activeWorkspaceWebId}
            scope={activeWorkspaceWebId}
            showBrandBar={false}
          >
            {children}
          </AppShell>
        ) : null}
      </div>
    </PortalContainerContext.Provider>
  );
};

export const getSupplyChainLayout = (page: ReactElement): ReactNode =>
  getLayoutWithSidebar(<SupplyChainShell>{page}</SupplyChainShell>, {
    fullWidth: true,
  });
