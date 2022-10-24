import { useMemo } from "react";
import { PropertyRow } from "./types";
import { extractEnrichedPropertyTypesFromEntity } from "./extract-enriched-property-types-from-entity";
import { sortRowData } from "../../../../../../../components/GlideGlid/utils";
import { useEntityEditor } from "../../entity-editor-context";

export const useRowData = () => {
  const { entity, propertySort } = useEntityEditor();

  const rowData = useMemo<PropertyRow[]>(() => {
    if (!entity) {
      return [];
    }

    const enrichedPropertyTypes =
      extractEnrichedPropertyTypesFromEntity(entity);

    return enrichedPropertyTypes;
  }, [entity]);

  const sortedRowData = useMemo(() => {
    return sortRowData(rowData, propertySort);
  }, [rowData, propertySort]);

  return sortedRowData;
};
