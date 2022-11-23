import { useCallback, useMemo } from "react";
import { PropertyRow } from "./types";
import { generatePropertyRowsFromEntity } from "./use-row-data/generate-property-rows-from-entity";
import { useEntityEditor } from "../../entity-editor-context";
import { fillRowDataIndentCalculations } from "./fill-row-data-indent-calculations";
import { flattenExpandedItemsOfTree } from "./flatten-expanded-items-of-tree";
import {
  sortRowData,
  TableSort,
} from "../../../../../../../components/grid/utils/sorting";

export const useRowData = () => {
  const { rootEntityAndSubgraph, propertyExpandStatus } = useEntityEditor();

  const rows = useMemo<PropertyRow[]>(() => {
    if (!rootEntityAndSubgraph) {
      return [];
    }

    return generatePropertyRowsFromEntity(rootEntityAndSubgraph);
  }, [rootEntityAndSubgraph]);

  const sortAndFlattenRowData = useCallback(
    (rowData: PropertyRow[], sort: TableSort<string>) => {
      const sortedRowData = sortRowData(rowData, sort);

      const flattenedRowData = flattenExpandedItemsOfTree(
        sortedRowData,
        propertyExpandStatus,
      );

      fillRowDataIndentCalculations(flattenedRowData);

      return flattenedRowData;
    },
    [propertyExpandStatus],
  );

  return [rows, sortAndFlattenRowData] as const;
};
