import { EditableGridCell, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { useSnackbar } from "../../../../../../../components/hooks/useSnackbar";
import { useEntityEditor } from "../../entity-editor-context";
import { useBlockProtocolUpdateEntity } from "../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolUpdateEntity";
import { propertyGridIndexes } from "./constants";
import { PropertyRow } from "./types";

export const useOnCellEdited = (rowData: PropertyRow[]) => {
  const snackbar = useSnackbar();
  const { rootEntityAndSubgraph, setEntity } = useEntityEditor();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const onCellEdited = useCallback(
    async ([col, row]: Item, newValue: EditableGridCell) => {
      if (!rootEntityAndSubgraph) {
        return;
      }

      const entity = rootEntityAndSubgraph.root;

      const key = propertyGridIndexes[col];
      const property = rowData[row];

      if (!key || !property) {
        throw new Error(`${key ? "property" : "key"} not found`);
      }

      const updatedProperties = {
        ...entity.properties,
        [property.propertyTypeId]: newValue.data,
      };

      /**
       * setting state for optimistic update
       * also storing previous entity, so we can rollback if API call fails
       */
      const prevEntity = entity;
      setEntity({
        ...entity,
        properties: updatedProperties,
      });

      try {
        await updateEntity({
          data: {
            entityId: entity.entityId,
            updatedProperties,
          },
        });
      } catch (error) {
        // rollback the optimistic update
        setEntity(prevEntity);
        snackbar.error(`Failed to update "${property.title}"`);
      }
    },
    [rowData, rootEntityAndSubgraph, setEntity, updateEntity, snackbar],
  );

  return onCellEdited;
};
