import { useCallback, useMemo } from "react";

import { STEP_TYPE_LABELS, STEP_TYPE_ORDER } from "../../../shared/categories";
import {
  type BaseMeasure,
  useBaseMeasure,
} from "../../../shared/measure-context";
import {
  compareStatusLabels,
  STATUS_LABELS_IN_ORDER,
  statusLabelForNode,
  type StatusActionLabel,
  type StatusStore,
} from "../../../shared/status";
import { trackSupplyChainInteraction } from "../../../shared/telemetry";
import { buildColumnFilter, countBy } from "./column-filter";

import type { SiteNode, StepType } from "../../../shared/types";
import type { ColumnFilter } from "./filter-menu";
import type { SortDir, SortKey } from "./row-types";

/**
 * Shared sort + filter logic for the three detail tables (dwell / planning /
 * trend). Each table renders a different set of columns but shares the same
 * Step-type + Status filters and the same sort model, so this hook owns:
 *
 * - the Step-type and Status `ColumnFilter`s (options, counts, selection);
 * - `displayedRows`: the incoming rows filtered by the hidden sets and then
 *   sorted. Status is sorted here (it needs the status history), and every
 *   other key is delegated to the table-specific `sortRows` so all ordering for
 *   a table lives in one place rather than being split with the data hook.
 * - `toggleSort`: flips direction or switches key (status defaults to ascending
 *   so "To action" leads).
 */
export function useStepTableView<Row extends SiteNode>({
  rows,
  siteId,
  sort,
  onSort,
  statusHistory,
  typeHidden,
  onTypeHiddenChange,
  productHidden,
  onProductHiddenChange,
  statusHidden,
  onStatusHiddenChange,
  sortRows,
  source,
}: {
  rows: Row[];
  /** Route site slug; scopes status keys to the global store. */
  siteId: string;
  sort: { key: SortKey; dir: SortDir };
  onSort: (next: { key: SortKey; dir: SortDir }) => void;
  statusHistory: StatusStore;
  typeHidden: Set<StepType>;
  onTypeHiddenChange: (next: Set<StepType>) => void;
  productHidden: Set<string>;
  onProductHiddenChange: (next: Set<string>) => void;
  statusHidden: Set<StatusActionLabel>;
  onStatusHiddenChange: (next: Set<StatusActionLabel>) => void;
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
  typeFilter: ColumnFilter;
  productFilter: ColumnFilter;
  statusFilter: ColumnFilter;
  displayedRows: Row[];
  toggleSort: (key: SortKey) => void;
} {
  const { measure } = useBaseMeasure();

  const statusOf = useCallback(
    (node: SiteNode): StatusActionLabel =>
      statusLabelForNode(siteId, node, statusHistory),
    [siteId, statusHistory],
  );

  const typeValues = useMemo(
    () =>
      STEP_TYPE_ORDER.filter((type) => rows.some((row) => row.type === type)),
    [rows],
  );
  const statusValues = useMemo(
    () =>
      STATUS_LABELS_IN_ORDER.filter((label) =>
        rows.some((row) => statusOf(row) === label),
      ),
    [rows, statusOf],
  );

  const typeFilter = useMemo(
    () =>
      buildColumnFilter<StepType>({
        header: "Step type",
        values: typeValues,
        labelOf: (type) => STEP_TYPE_LABELS[type],
        counts: countBy(rows, (row) => row.type),
        hidden: typeHidden,
        onHiddenChange: onTypeHiddenChange,
        searchable: false,
      }),
    [typeValues, rows, typeHidden, onTypeHiddenChange],
  );
  const productFilter = useMemo(() => {
    const names = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const product of row.products) {
        names.set(product.id, product.name);
        counts.set(product.id, (counts.get(product.id) ?? 0) + 1);
      }
    }
    const values = [...names.keys()].sort((left, right) =>
      (names.get(left) ?? "").localeCompare(names.get(right) ?? ""),
    );
    return buildColumnFilter<string>({
      header: "Product",
      values,
      labelOf: (id) => names.get(id) ?? id,
      counts,
      hidden: productHidden,
      onHiddenChange: onProductHiddenChange,
    });
  }, [rows, productHidden, onProductHiddenChange]);

  const statusFilter = useMemo(
    () =>
      buildColumnFilter<StatusActionLabel>({
        header: "Status",
        values: statusValues,
        labelOf: (label) => label,
        counts: countBy(rows, statusOf),
        hidden: statusHidden,
        onHiddenChange: onStatusHiddenChange,
        searchable: false,
      }),
    [statusValues, rows, statusOf, statusHidden, onStatusHiddenChange],
  );

  const displayedRows = useMemo(() => {
    const passesProduct = (row: Row) =>
      row.products.length === 0 ||
      row.products.some((product) => !productHidden.has(product.id));
    const filtered = rows.filter(
      (row) =>
        !typeHidden.has(row.type) &&
        !statusHidden.has(statusOf(row)) &&
        passesProduct(row),
    );
    if (sort.key === "status") {
      return [...filtered].sort((left, right) => {
        const cmp = compareStatusLabels(statusOf(left), statusOf(right));
        return sort.dir === "desc" ? -cmp : cmp;
      });
    }
    return sortRows(filtered, sort, measure);
  }, [
    rows,
    typeHidden,
    productHidden,
    statusHidden,
    statusOf,
    sort,
    measure,
    sortRows,
  ]);

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
    typeFilter,
    productFilter,
    statusFilter,
    displayedRows,
    toggleSort,
  };
}
