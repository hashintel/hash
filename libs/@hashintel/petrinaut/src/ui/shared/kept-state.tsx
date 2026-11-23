import { useState, type ReactNode } from "react";

import { KeptStateContext } from "./use-kept-state";

/**
 * Holds what the components below it keep while they are unmounted: the
 * values of `useKeptState` and the offsets of `useKeptScroll`. It goes around
 * what unmounts, such as a panel that closes.
 *
 * What is kept belongs to `scope`, and is dropped when the scope changes.
 */
export const KeptState: React.FC<{ scope?: string; children: ReactNode }> = ({
  scope,
  children,
}) => {
  const [kept, setKept] = useState(() => ({
    scope,
    values: new Map<string, unknown>(),
  }));
  if (kept.scope !== scope) {
    setKept({ scope, values: new Map() });
  }
  return <KeptStateContext value={kept.values}>{children}</KeptStateContext>;
};
