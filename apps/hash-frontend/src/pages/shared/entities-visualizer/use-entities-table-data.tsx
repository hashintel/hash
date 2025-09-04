import { isBaseUrl } from "@blockprotocol/type-system";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { EntityQueryCursor } from "@local/hash-graph-client/api";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";
import { serializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";
import { useCallback, useState } from "react";

import { generateTableDataFromRows } from "./entities-table/use-entities-table/generate-table-data-from-rows";
import type {
  EntitiesTableColumn,
  EntitiesTableData,
  EntitiesTableRow,
  SourceOrTargetFilterData,
  UpdateTableDataFn,
  VisibleDataTypeIdsByPropertyBaseUrl,
} from "./types";
import type { EntitiesVisualizerData } from "./use-entities-visualizer-data";

export const useEntitiesTableData = ({
  hideColumns,
  hideArchivedColumn,
}: {
  hideColumns?: (keyof EntitiesTableRow)[];
  hideArchivedColumn?: boolean;
}): {
  tableData: EntitiesTableData | null;
  updateTableData: UpdateTableDataFn;
} => {
  const [tableData, setTableData] = useState<EntitiesTableData | null>(null);

  const updateTableData = useCallback(
    ({
      appliedPaginationCursor,
      closedMultiEntityTypesRootMap,
      definitions,
      entities,
      subgraph,
    }: Pick<EntitiesVisualizerData, "definitions" | "entities" | "subgraph"> & {
      appliedPaginationCursor: EntityQueryCursor | null;
      closedMultiEntityTypesRootMap: ClosedMultiEntityTypesRootMap;
    }) => {
      if (!definitions) {
        throw new Error("Definitions are required");
      }

      if (!entities) {
        throw new Error("Entities are required");
      }

      if (!subgraph) {
        throw new Error("Subgraph is required");
      }

      const resultFromRows = generateTableDataFromRows({
        closedMultiEntityTypesRootMap,
        definitions,
        entities: entities.map((entity) => entity.toJSON()),
        subgraph: serializeSubgraph(subgraph),
        hideColumns,
        hideArchivedColumn,
      });

      setTableData((currentTableData) => {
        if (appliedPaginationCursor && currentTableData) {
          /**
           * When paginating, we need to combine the following with previous results:
           * 1. Visible data types
           * 2. Entity types with multiple versions present
           * 3. The table data itself (rows)
           * 4. Filters which are affected by specific rows (sources and targets)
           *
           * Note that the remaining filters, e.g. webIds, createdByActors, etc, are from the whole result set,
           * not built up from visible rows, and can be reset directly from each API response.
           */

          const combinedVisibleDataTypeIdsByPropertyBaseUrl: VisibleDataTypeIdsByPropertyBaseUrl =
            resultFromRows.visibleDataTypeIdsByPropertyBaseUrl;
          for (const [baseUrl, dataTypeIds] of typedEntries(
            currentTableData.visibleDataTypeIdsByPropertyBaseUrl,
          )) {
            combinedVisibleDataTypeIdsByPropertyBaseUrl[baseUrl] ??= new Set();
            combinedVisibleDataTypeIdsByPropertyBaseUrl[baseUrl] =
              combinedVisibleDataTypeIdsByPropertyBaseUrl[baseUrl].union(
                dataTypeIds,
              );
          }

          const combinedEntityTypesWithMultipleVersionsPresent = new Set([
            ...currentTableData.entityTypesWithMultipleVersionsPresent,
            ...resultFromRows.entityTypesWithMultipleVersionsPresent,
          ]);

          const addedColumnIds: Set<string> = new Set();
          const combinedColumns: EntitiesTableColumn[] = [];

          for (const column of [
            ...currentTableData.columns,
            ...resultFromRows.columns,
          ]) {
            if (addedColumnIds.has(column.id)) {
              continue;
            }

            addedColumnIds.add(column.id);

            combinedColumns.push(column);
          }

          const combinedSourcesFilter: SourceOrTargetFilterData =
            resultFromRows.visibleRowsFilterData.sources;
          for (const [entityId, { count, label }] of typedEntries(
            currentTableData.visibleRowsFilterData.sources,
          )) {
            if (combinedSourcesFilter[entityId]) {
              combinedSourcesFilter[entityId].count += count;
            } else {
              combinedSourcesFilter[entityId] = {
                count,
                label,
              };
            }
          }

          const combinedTargetsFilter: SourceOrTargetFilterData =
            resultFromRows.visibleRowsFilterData.targets;

          for (const [entityId, { count, label }] of typedEntries(
            currentTableData.visibleRowsFilterData.targets,
          )) {
            if (combinedTargetsFilter[entityId]) {
              combinedTargetsFilter[entityId].count += count;
            } else {
              combinedTargetsFilter[entityId] = {
                count,
                label,
              };
            }
          }

          return {
            rows: [...currentTableData.rows, ...resultFromRows.rows],
            columns: combinedColumns.sort((a, b) => {
              /**
               * The first page might not have source and target columns added (if there are no links), but a later one will.
               * We want source and target columns to come before the property columns, so we sort property columns to the end.
               */

              const isAPropertyColumn = isBaseUrl(a.id);
              const isBPropertyColumn = isBaseUrl(b.id);

              if (isAPropertyColumn && !isBPropertyColumn) {
                return 1;
              }

              if (!isAPropertyColumn && isBPropertyColumn) {
                return -1;
              }

              if (isAPropertyColumn && isBPropertyColumn) {
                return a.title.localeCompare(b.title);
              }

              return 0;
            }),
            entityTypesWithMultipleVersionsPresent:
              combinedEntityTypesWithMultipleVersionsPresent,
            visibleDataTypeIdsByPropertyBaseUrl:
              combinedVisibleDataTypeIdsByPropertyBaseUrl,
            visibleRowsFilterData: {
              ...resultFromRows.visibleRowsFilterData,
              sources: combinedSourcesFilter,
              targets: combinedTargetsFilter,
              noSourceCount:
                resultFromRows.visibleRowsFilterData.noSourceCount +
                currentTableData.visibleRowsFilterData.noSourceCount,
              noTargetCount:
                resultFromRows.visibleRowsFilterData.noTargetCount +
                currentTableData.visibleRowsFilterData.noTargetCount,
            },
          };
        }

        // this is the first page (no cursor), so we can just return the result without combining
        return {
          ...resultFromRows,
          columns: resultFromRows.columns,
          visibleRowsFilterData: resultFromRows.visibleRowsFilterData,
          rows: resultFromRows.rows,
        };
      });
    },
    [hideArchivedColumn, hideColumns],
  );

  return {
    tableData,
    updateTableData,
  };
};
