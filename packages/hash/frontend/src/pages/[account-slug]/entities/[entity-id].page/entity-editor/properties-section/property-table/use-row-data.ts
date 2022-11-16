import { useCallback, useMemo } from "react";
import { RowData } from "../../../../../../../components/GlideGlid/glide-grid";
import { PropertyRow } from "./types";
import { generatePropertyRowsFromEntity } from "./use-row-data/generate-property-rows-from-entity";
import { useEntityEditor } from "../../entity-editor-context";
import { fillRowDataIndentCalculations } from "./fill-row-data-indent-calculations";
import { flattenExpandedItemsOfTree } from "./flatten-expanded-items-of-tree";

export const useRowData = () => {
  const { rootEntityAndSubgraph, propertyExpandStatus } = useEntityEditor();

  const rowData = useMemo<PropertyRow[]>(() => {
    if (!rootEntityAndSubgraph) {
      return [];
    }

    return generatePropertyRowsFromEntity(rootEntityAndSubgraph);
  }, [rootEntityAndSubgraph]);

  const flattenRowData = useCallback(
    (sortedRowData: RowData) => {
      const propertyRows = sortedRowData as PropertyRow[];

      const flattenedRowData = flattenExpandedItemsOfTree(
        propertyRows,
        propertyExpandStatus,
      );

      fillRowDataIndentCalculations(flattenedRowData);

      return flattenedRowData;
    },
    [propertyExpandStatus],
  );

  return [rowData, flattenRowData] as const;
};
