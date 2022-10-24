import { pick } from "lodash";
import { useMemo } from "react";
import { PropertyRow } from "./types";
import { extractEnrichedPropertyTypesFromEntity } from "./extract-enriched-property-types-from-entity";
import { sortRowData } from "../../../../../../../components/GlideGlid/utils";
import { useEntityEditor } from "../../entity-editor-context";

export const useRowData = () => {
  const { entityRootedSubgraph, propertySort } = useEntityEditor();

  const rowData = useMemo<PropertyRow[]>(() => {
    if (!entityRootedSubgraph) {
      return [];
    }

    const enrichedPropertyTypes =
      extractEnrichedPropertyTypesFromEntity(entityRootedSubgraph);

    return enrichedPropertyTypes.map((type) =>
      pick(type, ["propertyTypeId", "value", "title", "dataTypes"]),
    );
  }, [entityRootedSubgraph]);

  const sortedRowData = useMemo(() => {
    return sortRowData(rowData, propertySort);
  }, [rowData, propertySort]);

  return sortedRowData;
};
