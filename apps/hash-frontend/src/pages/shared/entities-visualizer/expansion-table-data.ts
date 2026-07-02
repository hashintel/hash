/**
 * Reflects graph frontier expansions in the entities table: the entities the
 * user OR-ed into the displayed set become rows appended after the query's
 * own rows.
 *
 * Each expansion batch carries its own type maps and subgraph (the query's
 * maps don't cover entities outside the filter), so rows are generated per
 * record and merged with the query table data via the same machinery the
 * paginated pages use.
 */
import { generateTableDataFromRows } from "./shared/generate-table-data-from-rows";
import { mergeTableData } from "./use-entities-visualizer-data/merge-table-data";

import type { ExpansionRecord } from "../graph-visualizer/components/frontier-expansion-store";
import type {
  EntitiesTableData,
  EntitiesTableRow,
} from "./entities-table-data";

interface WithExpansionRowsOptions {
  readonly hideColumns: (keyof EntitiesTableRow)[] | undefined;
  readonly hideArchivedColumn: boolean;
}

/**
 * Appends the expansion records' entities to `tableData` as extra rows.
 *
 * An expanded entity that has since become a query root (a later "Show more"
 * page fetched it) is skipped — the query row wins, so nothing appears
 * twice. Returns `tableData` unchanged (same reference) when the records add
 * nothing, so memoized consumers see no change.
 */
export function withExpansionRows(
  tableData: EntitiesTableData,
  records: readonly ExpansionRecord[],
  { hideColumns, hideArchivedColumn }: WithExpansionRowsOptions,
): EntitiesTableData {
  if (records.length === 0) {
    return tableData;
  }

  const presentIds = new Set(tableData.rows.map((row) => row.entityId));

  const additions = records.flatMap((record) => {
    // Without its type maps a record's rows can't be resolved; the expansion
    // query always includes them, so this is a type guard, not a real path.
    if (!record.rootMap || !record.definitions) {
      return [];
    }

    const freshEntities = record.expandedEntities.filter(
      (entity) => !presentIds.has(entity.metadata.recordId.entityId),
    );
    if (freshEntities.length === 0) {
      return [];
    }

    for (const entity of freshEntities) {
      presentIds.add(entity.metadata.recordId.entityId);
    }

    return [
      generateTableDataFromRows({
        closedMultiEntityTypesRootMap: record.rootMap,
        definitions: record.definitions,
        entities: freshEntities.map((entity) => entity.toJSON()),
        subgraph: record.subgraph,
        hideColumns,
        hideArchivedColumn,
      }),
    ];
  });

  if (additions.length === 0) {
    return tableData;
  }

  return additions.reduce(mergeTableData, tableData);
}
