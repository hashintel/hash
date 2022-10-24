import {
  EditableGridCell,
  GridCellKind,
  Item,
} from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { useSnackbar } from "../../../../../../../components/hooks/useSnackbar";
import { useEntityEditor } from "../../entity-editor-context";
import { useBlockProtocolUpdateEntity } from "../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolUpdateEntity";
import { propertyGridIndexes } from "./constants";
import { PropertyRow } from "./types";
import { ValueCell } from "./cells/value-cell";

// only used for 'Values' column
export const useOnCellEdited = (rowData: PropertyRow[]) => {
  const snackbar = useSnackbar();
  const { entity, setEntity } = useEntityEditor();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const onCellEdited = useCallback(
    async ([col, row]: Item, newValue: EditableGridCell) => {
      if (!entity || newValue.kind !== GridCellKind.Custom) {
        return;
      }

      const valueCell = newValue as ValueCell;

      const key = propertyGridIndexes[col];
      const property = rowData[row];

      if (!key || !property) {
        throw new Error(`${key ? "property" : "key"} not found`);
      }

      const updatedProperties = {
        ...entity.properties,
        [property.propertyTypeId]: valueCell.data.property.value,
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
    [rowData, entity, setEntity, updateEntity, snackbar],
  );

  return onCellEdited;
};
