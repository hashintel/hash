import { useCallback, useMemo } from "react";
import { PropertyRow } from "./types";
import { generatePropertyRowsFromEntity } from "./use-rows/generate-property-rows-from-entity";
import { useEntityEditor } from "../../entity-editor-context";
import { fillRowIndentCalculations } from "./fill-row-indent-calculations";
import { flattenExpandedItemsOfTree } from "./flatten";
import {
  defaultSortRows,
  ColumnSort,
} from "../../../../../../../components/grid/utils/sorting";

export const useRows = () => {
  const { entitySubgraph, propertyExpandStatus } = useEntityEditor();

  const rows = useMemo<PropertyRow[]>(() => {
    return generatePropertyRowsFromEntity(entitySubgraph);
  }, [entitySubgraph]);

  const sortAndFlattenRows = useCallback(
    (_rows: PropertyRow[], sort: ColumnSort<string>) => {
      const sortedRows = defaultSortRows(_rows, sort);

      const flattenedRows = flattenExpandedItemsOfTree(
        sortedRows,
        propertyExpandStatus,
      );

      fillRowIndentCalculations(flattenedRows);

      return flattenedRows;
    },
    [propertyExpandStatus],
  );

  return [rows, sortAndFlattenRows] as const;
};
