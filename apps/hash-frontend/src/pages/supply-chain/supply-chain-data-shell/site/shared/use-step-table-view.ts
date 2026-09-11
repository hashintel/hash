import { useCallback, useMemo } from "react";

import {
  type BaseMeasure,
  useBaseMeasure,
} from "../../../shared/measure-context";
import {
  compareStatusLabels,
  statusLabelForNode,
  type StatusActionLabel,
  type StatusStore,
} from "../../../shared/status";
import { trackSupplyChainInteraction } from "../../../shared/telemetry";

import type { SiteNode } from "../../../shared/types";
import type { SortDir, SortKey } from "./row-types";

/**
 * Shared sort logic for the three detail tables (dwell / planning / trend).
 * Row filtering happens upstream via the shared step-filter bar (see
 * `step-filters.ts`), so this hook owns:
 *
 * - `displayedRows`: the incoming rows sorted. Status is sorted here (it needs
 *   the status history), and every other key is delegated to the
 *   table-specific `sortRows` so all ordering for a table lives in one place
 *   rather than being split with the data hook.
 * - `toggleSort`: flips direction or switches key (status defaults to
 *   ascending so "To action" leads).
 */
export function useStepTableView<Row extends SiteNode>({
  rows,
  siteId,
  sort,
  onSort,
  statusHistory,
  sortRows,
  source,
}: {
  rows: Row[];
  /** Route site slug; scopes status keys to the global store. */
  siteId: string;
  sort: { key: SortKey; dir: SortDir };
  onSort: (next: { key: SortKey; dir: SortDir }) => void;
  statusHistory: StatusStore;
  /** Table-specific sorter for every non-status key (measure-aware). */
  sortRows: (
    rows: Row[],
    sort: { key: SortKey; dir: SortDir },
    measure: BaseMeasure,
  ) => Row[];
  /** Telemetry `source` for the sort interaction. */
  source: string;
}): {
  statusOf: (node: SiteNode) => StatusActionLabel;
  displayedRows: Row[];
  toggleSort: (key: SortKey) => void;
} {
  const { measure } = useBaseMeasure();

  const statusOf = useCallback(
    (node: SiteNode): StatusActionLabel =>
      statusLabelForNode(siteId, node, statusHistory),
    [siteId, statusHistory],
  );

  const displayedRows = useMemo(() => {
    if (sort.key === "status") {
      return [...rows].sort((left, right) => {
        const cmp = compareStatusLabels(statusOf(left), statusOf(right));
        return sort.dir === "desc" ? -cmp : cmp;
      });
    }
    return sortRows(rows, sort, measure);
  }, [rows, statusOf, sort, measure, sortRows]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      trackSupplyChainInteraction({
        interaction: "table_sort_changed",
        siteId,
        source,
      });
      if (sort.key === key) {
        onSort({ key, dir: sort.dir === "desc" ? "asc" : "desc" });
      } else {
        onSort({ key, dir: key === "status" ? "asc" : "desc" });
      }
    },
    [sort, onSort, siteId, source],
  );

  return {
    statusOf,
    displayedRows,
    toggleSort,
  };
}
