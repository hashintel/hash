import { useMemo } from "react";
import { PropertyRow } from "./types";
import { generatePropertyRowsFromEntity } from "./generate-property-rows-from-entity";
import {
  sortRowData,
  TableExpandStatus,
} from "../../../../../../../components/GlideGlid/utils";
import { useEntityEditor } from "../../entity-editor-context";
import { fillRowDataIndentCalculations } from "./fill-row-data-indent-calculations";

const flattenExpandedItemsOfTree = <T extends { children: T[] }>(
  tree: T[],
  expandStatus: TableExpandStatus,
  propertyUsedForExpandStatus: keyof T,
): T[] => {
  const flattened: T[] = [];

  for (const item of tree) {
    flattened.push(item);

    const id = item[propertyUsedForExpandStatus] as string;
    const expanded = expandStatus[id];

    if (expanded) {
      flattened.push(
        ...flattenExpandedItemsOfTree(
          item.children,
          expandStatus,
          propertyUsedForExpandStatus,
        ),
      );
    }
  }

  return flattened;
};

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
    "rowId",
  );

  fillRowDataIndentCalculations(flattenedRowData);

  return flattenedRowData;
};
