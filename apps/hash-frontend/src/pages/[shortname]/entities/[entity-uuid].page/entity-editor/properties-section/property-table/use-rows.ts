import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { useCallback } from "react";

import type {
  GridSort,
  SortGridRows,
} from "../../../../../../../components/grid/grid";
import { useEntityEditor } from "../../entity-editor-context";
import { fillRowIndentCalculations } from "./fill-row-indent-calculations";
import { flattenExpandedItemsOfTree } from "./flatten";
import type { PropertyColumn, PropertyColumnKey, PropertyRow } from "./types";
import { usePropertyRowsFromEntity } from "./use-rows/use-property-rows-from-entity";

const sortPropertyRows: SortGridRows<
  PropertyRow,
  PropertyColumn,
  PropertyColumnKey
> = (rows, sort) => {
  const { columnKey, direction } = sort;

  return rows.toSorted((a, b) => {
    let firstString = "";
    let secondString = "";

    if (columnKey === "title") {
      firstString = a.title;
      secondString = b.title;
    } else if (columnKey === "value") {
      if (typeof a.value === "number" && typeof b.value === "number") {
        return (a.value - b.value) * (direction === "asc" ? 1 : -1);
      }

      firstString = stringifyPropertyValue(a.value);
      secondString = stringifyPropertyValue(b.value);
    } else {
      firstString = a.permittedDataTypes[0]?.schema.title ?? "";
      secondString = b.permittedDataTypes[0]?.schema.title ?? "";
    }

    const comparison = firstString.localeCompare(secondString);

    return direction === "asc" ? comparison : -comparison;
  });
};

export const useRows = () => {
  const { propertyExpandStatus } = useEntityEditor();

  const rows = usePropertyRowsFromEntity();

  const sortAndFlattenRows = useCallback(
    (_rows: PropertyRow[], sort: GridSort<PropertyColumnKey>) => {
      const sortedRows = sortPropertyRows(_rows, sort);

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
