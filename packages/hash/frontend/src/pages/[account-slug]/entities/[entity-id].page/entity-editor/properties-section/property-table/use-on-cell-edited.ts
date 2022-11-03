import {
  EditableGridCell,
  GridCellKind,
  Item,
} from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { cloneDeep, set } from "lodash";
import { useSnackbar } from "../../../../../../../components/hooks/useSnackbar";
import { useEntityEditor } from "../../entity-editor-context";
import { useBlockProtocolUpdateEntity } from "../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolUpdateEntity";
import { propertyGridIndexes } from "./constants";
import { PropertyRow } from "./types";
import { ValueCell } from "./cells/value-cell/types";

/**
 * This onCellEditor is used to handle editing the data only at `Values` column
 */
export const useOnCellEdited = (rowData: PropertyRow[]) => {
  const snackbar = useSnackbar();
  const { rootEntityAndSubgraph, setEntity } = useEntityEditor();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const onCellEdited = useCallback(
    async ([col, row]: Item, newValue: EditableGridCell) => {
      if (!rootEntityAndSubgraph || newValue.kind !== GridCellKind.Custom) {
        return;
      }

      const entity = rootEntityAndSubgraph.root;

      const valueCell = newValue as ValueCell;

      const key = propertyGridIndexes[col];
      const property = rowData[row];

      if (key !== "value") {
        // only "value" cell can be edited
        return;
      }

      if (!key || !property) {
        throw new Error(`${key ? "property" : "key"} not found`);
      }

      const updatedProperties = cloneDeep(entity.properties);

      const { propertyKeyChain } = property;

      /**
       * we're reaching to the nested property by the property keys array
       * so we can update the deeply nested properties,
       * by using keys pathing to specific property called `propertyKeyChain`
       */
      set(updatedProperties, propertyKeyChain, valueCell.data.property.value);

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
