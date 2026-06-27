import { useEffect, useMemo, useRef, useState } from "react";

import { PortalContainerContext } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getLayoutWithSidebar } from "../../../shared/layout";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";
import { useAuthInfo } from "../../shared/auth-info-context";
import { useActiveWorkspace } from "../../shared/workspace-context";
import { SupplyChainDataShell } from "../supply-chain-data-shell";
import { LoadingState } from "./load-state";
import { resolveSupplyChainDataWebId } from "./supply-chain-analysis-requests";

import type { WebId } from "@blockprotocol/type-system";
import type { ReactElement, ReactNode } from "react";

const emptyState = css({
  h: "full",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "fg.subtle",
  textStyle: "sm",
});

/**
 * Layout shared by every `/supply-chain/*` page.
 *
 * The subtree is wrapped in `.hash-ds-root` so the ds-components Panda tokens
 * resolve, and that element is supplied as the `PortalContainerContext` so ds
 * and Ark overlays (dialogs, tooltips, selects) portal *inside* the token
 * scope rather than at `document.body`.
 *
 * `SupplyChainDataShell` is keyed by the resolved data web so switching workspace remounts
 * it and reloads the product/site registry for the correct scope.
 */
const SupplyChainShell = ({ children }: { children: ReactNode }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { activeWorkspace, activeWorkspaceWebId, updateActiveWorkspaceWebId } =
    useActiveWorkspace();
  const { authenticatedUser } = useAuthInfo();
  const [dataWebId, setDataWebId] = useState<WebId | null>();

  const candidateWebIds = useMemo(() => {
    if (!authenticatedUser) {
      return activeWorkspaceWebId ? [activeWorkspaceWebId] : [];
    }

    const orgWebIds = authenticatedUser.memberOf.map(({ org }) => org.webId);
    const personalWebId = authenticatedUser.accountId as WebId;

    return [
      ...(activeWorkspace?.kind === "user" && activeWorkspaceWebId
        ? [activeWorkspaceWebId]
        : []),
      ...(activeWorkspace?.kind === "org" && activeWorkspaceWebId
        ? [activeWorkspaceWebId]
        : []),
      ...orgWebIds,
      personalWebId,
    ].filter(
      (webId, index, webIds): webId is WebId =>
        !!webId && webIds.indexOf(webId) === index,
    );
  }, [activeWorkspace, activeWorkspaceWebId, authenticatedUser]);

  useEffect(() => {
    let cancelled = false;

    setDataWebId(undefined);

    void resolveSupplyChainDataWebId({ candidateWebIds })
      .then((resolvedWebId) => {
        if (!cancelled) {
          setDataWebId(resolvedWebId);
          const resolvedOrg = resolvedWebId
            ? authenticatedUser?.memberOf.find(
                ({ org }) => org.webId === resolvedWebId,
              )
            : undefined;
          if (
            resolvedOrg &&
            resolvedWebId !== activeWorkspaceWebId &&
            activeWorkspace?.kind !== "user"
          ) {
            updateActiveWorkspaceWebId(resolvedOrg.org.webId);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataWebId(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeWorkspace,
    activeWorkspaceWebId,
    authenticatedUser,
    candidateWebIds,
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
        {dataWebId === undefined ? (
          <LoadingState
            className={emptyState}
            message="Resolving supply-chain workspace..."
          />
        ) : dataWebId ? (
          <SupplyChainDataShell key={dataWebId} scope={dataWebId}>
            {children}
          </SupplyChainDataShell>
        ) : (
          <div className={emptyState}>
            No supply-chain dataset is available in your workspaces.
          </div>
        )}
      </div>
    </PortalContainerContext.Provider>
  );
};

export const getSupplyChainLayout = (page: ReactElement): ReactNode =>
  getLayoutWithSidebar(<SupplyChainShell>{page}</SupplyChainShell>, {
    fullWidth: true,
  });
