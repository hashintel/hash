import { createContext, useContext } from "react";

/**
 * The active data scope. Supply-chain views use this to scope analysis queries,
 * status reports, and user preferences to the resolved HASH web.
 *
 * Following the codebase convention (see `registry-context`/`cost`), the context
 * + hook live here and `SupplyChainDataShell` renders `ScopeContext.Provider` inline.
 */
export const LOCAL_SCOPE = "local";

export interface Scope {
  scope: string;
}

export const ScopeContext = createContext<Scope>({ scope: LOCAL_SCOPE });

export function useScope(): string {
  return useContext(ScopeContext).scope;
}
