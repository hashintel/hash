import { pick } from "lodash";
import { useMemo } from "react";
import { Row } from "./types";
import { extractEnrichedPropertyTypesFromEntity } from "./extract-enriched-property-types-from-entity";
import { useEntityEditor } from "../entity-editor-context";

export const useRowData = () => {
  const { entity, propertySort } = useEntityEditor();

  const rowData = useMemo<Row[]>(() => {
    if (!entity) {
      return [];
    }

    const enrichedPropertyTypes =
      extractEnrichedPropertyTypesFromEntity(entity);

    return enrichedPropertyTypes.map((type) =>
      pick(type, ["propertyTypeId", "value", "title", "dataTypes"]),
    );
  }, [entity]);

  const sortedRowData = useMemo(() => {
    return rowData.sort((row1, row2) => {
      // we sort only by alphabetical order for now
      const key1 = String(row1[propertySort.key]);
      const key2 = String(row2[propertySort.key]);
      let comparison = key1.localeCompare(key2);

      if (propertySort.dir === "desc") {
        // reverse if descending
        comparison = -comparison;
      }

      return comparison;
    });
  }, [rowData, propertySort]);

  return sortedRowData;
};
