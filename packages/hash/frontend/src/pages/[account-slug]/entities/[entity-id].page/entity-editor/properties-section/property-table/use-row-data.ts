import { useMemo } from "react";
import { PropertyRow } from "./types";
import { generatePropertyRowsFromEntity } from "./use-row-data/generate-property-rows-from-entity";
import { useEntityEditor } from "../../entity-editor-context";
import { fillRowDataIndentCalculations } from "./fill-row-data-indent-calculations";
import { sortRowData } from "../../../../../../../components/GlideGlid/utils/sorting";
import { flattenExpandedItemsOfTree } from "./flatten-expanded-items-of-tree";

export const useRowData = () => {
  const { rootEntityAndSubgraph, propertySort, propertyExpandStatus } =
    useEntityEditor();

  const rowData = useMemo<PropertyRow[]>(() => {
    if (!rootEntityAndSubgraph) {
      return [];
    }

    return generatePropertyRowsFromEntity(rootEntityAndSubgraph);
  }, [rootEntityAndSubgraph]);

  const sortedRowData = useMemo(
    () => sortRowData(rowData, propertySort),
    [rowData, propertySort],
  );

  const flattenedRowData = flattenExpandedItemsOfTree(
    sortedRowData,
    propertyExpandStatus,
  );

  fillRowDataIndentCalculations(flattenedRowData);

  return flattenedRowData;
};
