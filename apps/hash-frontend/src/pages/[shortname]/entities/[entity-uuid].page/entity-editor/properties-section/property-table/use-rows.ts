import { useCallback } from "react";

import type { ColumnSort } from "../../../../../../../components/grid/utils/sorting";
import { defaultSortRows } from "../../../../../../../components/grid/utils/sorting";
import { useEntityEditor } from "../../entity-editor-context";
import { fillRowIndentCalculations } from "./fill-row-indent-calculations";
import { flattenExpandedItemsOfTree } from "./flatten";
import type { PropertyRow } from "./types";
import { usePropertyRowsFromEntity } from "./use-rows/use-property-rows-from-entity";

export const useRows = () => {
  const { propertyExpandStatus } = useEntityEditor();

  const rows = usePropertyRowsFromEntity();

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
