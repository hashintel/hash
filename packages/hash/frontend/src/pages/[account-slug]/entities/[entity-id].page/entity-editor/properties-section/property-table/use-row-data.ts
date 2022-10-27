import { useMemo } from "react";
import { PropertyRow } from "./types";
import { generatePropertyRowsFromEntity } from "./generate-property-rows-from-entity";
import { sortRowData } from "../../../../../../../components/GlideGlid/utils";
import { useEntityEditor } from "../../entity-editor-context";

type TreeItem<T> = T & { children: T[]; expanded: boolean };

const flattenExpandedItemsOfTree = <T>(tree: TreeItem<T>[]): TreeItem<T>[] => {
  const flattened: TreeItem<T>[] = [];

  for (const item of tree) {
    flattened.push(item);

    if (item.expanded) {
      /** @todo fix typescript issue */
      flattened.push(...flattenExpandedItemsOfTree(item.children));
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

    return generatePropertyRowsFromEntity(
      rootEntityAndSubgraph,
      propertyExpandStatus,
    );
  }, [rootEntityAndSubgraph, propertyExpandStatus]);

  const sortedRowData = useMemo(() => {
    return sortRowData(rowData, propertySort);
  }, [rowData, propertySort]);

  /** @todo memoize this? */
  const flattenedRowData = flattenExpandedItemsOfTree(sortedRowData);

  return flattenedRowData;
};
