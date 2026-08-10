import { useEffect, useMemo, useRef } from "react";

import { PortalContainerContext } from "@hashintel/ds-components";

import { getLayoutWithSidebar } from "../../../shared/layout";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";
import { useAuthInfo } from "../../shared/auth-info-context";
import { useActiveWorkspace } from "../../shared/workspace-context";
import { SupplyChainDataShell } from "../supply-chain-data-shell";
import { SupplyChainAppSkeleton } from "./load-state";
import { useSearchParams } from "./use-search-params";

import type { WebId } from "@blockprotocol/type-system";
import type { ReactElement, ReactNode } from "react";

/**
 * Layout shared by every `/supply-chain/*` page.
 *
 * The subtree is wrapped in `.hash-ds-root` so the ds-components Panda tokens
 * resolve, and that element is supplied as the `PortalContainerContext` so ds
 * and Ark overlays (dialogs, tooltips, selects) portal *inside* the token
 * scope rather than at `document.body`.
 *
 * `SupplyChainDataShell` is keyed by the active workspace so switching workspace remounts
 * it and reloads the product/site registry for the correct scope.
 */
const SupplyChainShell = ({ children }: { children: ReactNode }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { authenticatedUser } = useAuthInfo();
  const { activeWorkspaceWebId, updateActiveWorkspaceWebId } =
    useActiveWorkspace();
  const [searchParams] = useSearchParams();
  const requestedWebId = searchParams.get("webId") as WebId | null;
  const authorizedRequestedWebId = useMemo(
    () =>
      requestedWebId &&
      authenticatedUser &&
      (requestedWebId === authenticatedUser.accountId ||
        authenticatedUser.memberOf.some(
          ({ org }) => org.webId === requestedWebId,
        ))
        ? requestedWebId
        : null,
    [authenticatedUser, requestedWebId],
  );
  const effectiveWorkspaceWebId =
    authorizedRequestedWebId ?? activeWorkspaceWebId;

  useEffect(() => {
    if (
      authorizedRequestedWebId &&
      authorizedRequestedWebId !== activeWorkspaceWebId
    ) {
      updateActiveWorkspaceWebId(authorizedRequestedWebId);
    }
  }, [
    activeWorkspaceWebId,
    authorizedRequestedWebId,
    updateActiveWorkspaceWebId,
  ]);

  return (
    <PortalContainerContext.Provider value={rootRef}>
      <div
        ref={rootRef}
        className="hash-ds-root"
        style={{
          height: `calc(100vh - ${HEADER_HEIGHT}px)`,
          overflow: "hidden",
        }}
      >
        {effectiveWorkspaceWebId === undefined ? (
          <SupplyChainAppSkeleton />
        ) : (
          <SupplyChainDataShell
            key={effectiveWorkspaceWebId}
            scope={effectiveWorkspaceWebId}
          >
            {children}
          </SupplyChainDataShell>
        )}
      </div>
    </PortalContainerContext.Provider>
  );
};

export const getSupplyChainLayout = (page: ReactElement): ReactNode =>
  getLayoutWithSidebar(<SupplyChainShell>{page}</SupplyChainShell>, {
    fullWidth: true,
  });
