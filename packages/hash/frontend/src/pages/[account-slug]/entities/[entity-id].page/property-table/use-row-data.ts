import { pick } from "lodash";
import { useMemo } from "react";
import { Row } from "./types";
import { extractEnrichedPropertyTypesFromEntity } from "./extract-enriched-property-types-from-entity";
import { useEntityEditor } from "../entity-editor-context";

export const useRowData = () => {
  const { entity } = useEntityEditor();

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

  return rowData;
};
