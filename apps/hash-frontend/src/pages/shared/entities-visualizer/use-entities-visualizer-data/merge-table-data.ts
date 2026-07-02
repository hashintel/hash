import { isBaseUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";

import type {
  EntitiesTableColumn,
  EntitiesTableData,
  VisibleDataTypeIdsByPropertyBaseUrl,
} from "../entities-table-data";

/**
 * Property columns come after the static columns (a later page may introduce
 * Source/Target columns that an earlier page lacked), and are ordered by
 * title among themselves. Static columns keep their relative order (sort is
 * stable).
 */
const compareColumns = (
  columnA: EntitiesTableColumn,
  columnB: EntitiesTableColumn,
): number => {
  const isAPropertyColumn = isBaseUrl(columnA.id);
  const isBPropertyColumn = isBaseUrl(columnB.id);

  if (isAPropertyColumn && !isBPropertyColumn) {
    return 1;
  }

  if (!isAPropertyColumn && isBPropertyColumn) {
    return -1;
  }

  if (isAPropertyColumn && isBPropertyColumn) {
    return columnA.title.localeCompare(columnB.title);
  }

  return 0;
};

/**
 * Combines the table data generated from two consecutive result pages: rows
 * are concatenated, while columns and the per-row rendering metadata (data
 * type pools, version markers) are unioned so every accumulated row stays
 * resolvable.
 */
export const mergeTableData = (
  base: EntitiesTableData,
  next: EntitiesTableData,
): EntitiesTableData => {
  const visibleDataTypeIdsByPropertyBaseUrl: VisibleDataTypeIdsByPropertyBaseUrl =
    { ...base.visibleDataTypeIdsByPropertyBaseUrl };

  for (const [propertyBaseUrl, dataTypes] of typedEntries(
    next.visibleDataTypeIdsByPropertyBaseUrl,
  )) {
    const existingDataTypes =
      visibleDataTypeIdsByPropertyBaseUrl[propertyBaseUrl];

    visibleDataTypeIdsByPropertyBaseUrl[propertyBaseUrl] = existingDataTypes
      ? existingDataTypes.union(dataTypes)
      : dataTypes;
  }

  const addedColumnIds = new Set<string>();
  const columns: EntitiesTableColumn[] = [];

  for (const column of [...base.columns, ...next.columns]) {
    if (addedColumnIds.has(column.id)) {
      continue;
    }

    addedColumnIds.add(column.id);
    columns.push(column);
  }

  columns.sort(compareColumns);

  return {
    columns,
    dataTypeDefinitions: {
      ...base.dataTypeDefinitions,
      ...next.dataTypeDefinitions,
    },
    entityTypesWithMultipleVersionsPresent:
      base.entityTypesWithMultipleVersionsPresent.union(
        next.entityTypesWithMultipleVersionsPresent,
      ),
    rows: [...base.rows, ...next.rows],
    visibleDataTypeIdsByPropertyBaseUrl,
  };
};
