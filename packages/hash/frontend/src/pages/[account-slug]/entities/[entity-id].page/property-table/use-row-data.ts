import { pick } from "lodash";
import { useMemo } from "react";
import { PropertyRow } from "./types";
import { extractEnrichedPropertyTypesFromEntity } from "./extract-enriched-property-types-from-entity";
import { useEntityEditor } from "../entity-editor-context";
import { sortRowData } from "../../../../../components/GlideGlid/utils";

export const useRowData = () => {
  const { entity, propertySort } = useEntityEditor();

  const rowData = useMemo<PropertyRow[]>(() => {
    if (!entity) {
      return [];
    }

    const enrichedPropertyTypes =
      extractEnrichedPropertyTypesFromEntity(entity);

    return enrichedPropertyTypes.map((type) =>
      pick(type, ["propertyTypeId", "value", "title", "dataTypes"]),
    );
  }, [entity]);

  const sortedRowData = sortRowData(rowData, propertySort);

  return sortedRowData;
};
