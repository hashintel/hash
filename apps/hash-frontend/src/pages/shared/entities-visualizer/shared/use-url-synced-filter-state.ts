import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import { createDefaultFilterState } from "./filter-state";
import {
  applyFilterValuesToAsPath,
  parseFilterStateFromQuery,
  serializeFilterStateToQuery,
} from "./filter-state-url";

import type { EntitiesFilterState } from "./filter-state";
import type { WebId } from "@blockprotocol/type-system";
import type { Dispatch, SetStateAction } from "react";

/**
 * Owns the entities visualizer filter state, optionally persisting it to (and
 * hydrating it from) the URL query string.
 *
 * When `enabled`, the initial state is read from the current URL and any
 * subsequent change is written back via a shallow `router.replace`, so that
 * refreshing, bookmarking, or sharing the page preserves the active filters.
 * When disabled, this behaves like a plain `useState` seeded with the defaults.
 */
export const useUrlSyncedFilterState = ({
  enabled,
  internalWebs,
  isTypePinned,
}: {
  enabled: boolean;
  internalWebs: { webId: WebId }[];
  isTypePinned: boolean;
}): [EntitiesFilterState, Dispatch<SetStateAction<EntitiesFilterState>>] => {
  const { asPath, query, replace } = useRouter();

  const internalWebIds = useMemo(
    () => internalWebs.map(({ webId }) => webId),
    [internalWebs],
  );

  const [filterState, setFilterState] = useState<EntitiesFilterState>(() =>
    enabled
      ? parseFilterStateFromQuery({ query, internalWebIds, isTypePinned })
      : createDefaultFilterState(internalWebIds),
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const filterValues = serializeFilterStateToQuery({
      filterState,
      internalWebIds,
      isTypePinned,
    });

    const { changed, nextAsPath } = applyFilterValuesToAsPath({
      asPath,
      filterValues,
    });

    if (changed) {
      void replace(nextAsPath, undefined, { shallow: true, scroll: false });
    }
  }, [enabled, filterState, internalWebIds, isTypePinned, asPath, replace]);

  return [filterState, setFilterState];
};
