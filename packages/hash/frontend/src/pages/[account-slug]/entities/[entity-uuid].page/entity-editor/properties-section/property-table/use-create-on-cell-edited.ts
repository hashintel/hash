import {
  EditableGridCell,
  GridCellKind,
  Item,
} from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { cloneDeep, set } from "lodash";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useSnackbar } from "../../../../../../../components/hooks/useSnackbar";
import { useEntityEditor } from "../../entity-editor-context";
import { useBlockProtocolUpdateEntity } from "../../../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolUpdateEntity";
import { propertyGridIndexes } from "./constants";
import { PropertyRow } from "./types";
import { ValueCell } from "./cells/value-cell/types";

/**
 * This onCellEdited is used to handle editing the data only at `Values` column
 */
export const useCreateOnCellEdited = () => {
  const snackbar = useSnackbar();
  const { entitySubgraph, setEntity } = useEntityEditor();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const createOnCellEdited = useCallback(
    (rows: PropertyRow[]) => {
      const onCellEdited = async (
        [colIndex, rowIndex]: Item,
        newValue: EditableGridCell,
      ) => {
        if (newValue.kind !== GridCellKind.Custom) {
          return;
        }

        const entity = getRoots(entitySubgraph)[0]!;

        const valueCell = newValue as ValueCell;

        const key = propertyGridIndexes[colIndex];
        const row = rows[rowIndex];

        if (key !== "value") {
          // only "value" cell can be edited
          return;
        }

        if (!key || !row) {
          throw new Error(`${key ? "property" : "key"} not found`);
        }

        const updatedProperties = cloneDeep(entity.properties);

        const { propertyKeyChain } = row;

        /**
         * we're reaching to the nested property by the property keys array
         * so we can update the deeply nested properties,
         * by using keys pathing to specific property called `propertyKeyChain`
         */
        set(
          updatedProperties,
          propertyKeyChain,
          valueCell.data.propertyRow.value,
        );

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
              entityId: entity.metadata.editionId.baseId,
              updatedProperties,
            },
          });
        } catch (error) {
          // rollback the optimistic update
          setEntity(prevEntity);
          snackbar.error(`Failed to update "${row.title}"`);
        }
      };

      return onCellEdited;
    },
    [entitySubgraph, setEntity, updateEntity, snackbar],
  );

  return createOnCellEdited;
};
