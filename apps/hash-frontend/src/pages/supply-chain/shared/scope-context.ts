import { createContext, useContext } from "react";

import type { WebId } from "@blockprotocol/type-system";

/**
 * The active data scope. Supply-chain views use this to scope analysis queries,
 * status reports, and user preferences to the resolved HASH web.
 *
 * Following the codebase convention (see `registry-context`/`cost`), the context
 * + hook live here and `SupplyChainDataShell` renders `ScopeContext.Provider` inline.
 */
export const LOCAL_SCOPE = "local" as WebId;

export interface Scope {
  scope: WebId;
}

export const ScopeContext = createContext<Scope>({ scope: LOCAL_SCOPE });

export function useScope(): WebId {
  return useContext(ScopeContext).scope;
}
