import { useMemo } from "react";
import { PropertyRow } from "./types";
import { extractEnrichedPropertyTypesFromEntity } from "./extract-enriched-property-types-from-entity";
import { sortRowData } from "../../../../../../../components/GlideGlid/utils";
import { useEntityEditor } from "../../entity-editor-context";

export const useRowData = () => {
  const { rootEntityAndSubgraph, propertySort } = useEntityEditor();

  const rowData = useMemo<PropertyRow[]>(() => {
    if (!rootEntityAndSubgraph) {
      return [];
    }

    const enrichedPropertyTypes = extractEnrichedPropertyTypesFromEntity(
      rootEntityAndSubgraph,
    );

    return enrichedPropertyTypes;
  }, [rootEntityAndSubgraph]);

  const sortedRowData = useMemo(() => {
    return sortRowData(rowData, propertySort);
  }, [rowData, propertySort]);

  return sortedRowData;
};
