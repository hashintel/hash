import { EditableGridCell, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { useBlockProtocolUpdateEntity } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolUpdateEntity";
import { useSnackbar } from "../../../../../components/hooks/useSnackbar";
import { useEntityEditor } from "../entity-editor-context";
import { gridIndexes } from "./constants";
import { Row } from "./types";

export const useOnCellEdited = (rowData: Row[]) => {
  const snackbar = useSnackbar();
  const { entity, setEntity } = useEntityEditor();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const onCellEdited = useCallback(
    async ([col, row]: Item, newValue: EditableGridCell) => {
      if (!entity) {
        return;
      }

      const key = gridIndexes[col];
      const property = rowData[row];

      if (!key || !property) {
        throw new Error();
      }

      const updatedProperties = {
        ...entity.properties,
        [property.propertyTypeId]: newValue.data,
      };

      /**
       * setting state for optimistic update
       * also storing previous entity, so we can rollback if API call fails
       */
      const prevEntity = { ...entity };
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
    [rowData, entity, setEntity, updateEntity, snackbar],
  );

  return onCellEdited;
};
