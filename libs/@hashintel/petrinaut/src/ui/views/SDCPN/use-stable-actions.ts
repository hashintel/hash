import { useState } from "react";

import { useLatest } from "../../../react/hooks/use-latest";

type Actions = Record<string, (...args: never[]) => unknown>;

/**
 * The given functions behind identities that never change: each calls the
 * latest function of its name. For handlers given to memoized children, which
 * render again for a new function. They are for events, not for render.
 */
export const useStableActions = <Given extends Actions>(
  actions: Given,
): Given => {
  const latest = useLatest(actions);
  const [stable] = useState(
    () =>
      Object.fromEntries(
        Object.keys(actions).map((name) => [
          name,
          (...args: never[]) => latest.current[name]!(...args),
        ]),
      ) as Given,
  );
  return stable;
};
