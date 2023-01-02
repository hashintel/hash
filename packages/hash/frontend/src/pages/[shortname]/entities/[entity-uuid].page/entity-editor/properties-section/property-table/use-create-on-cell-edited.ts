import {
  EditableGridCell,
  GridCellKind,
  Item,
} from "@glideapps/glide-data-grid";
import { EntityId } from "@hashintel/hash-shared/types";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { cloneDeep, set } from "lodash";
import { useCallback } from "react";

import { useBlockProtocolUpdateEntity } from "../../../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useSnackbar } from "../../../../../../../components/hooks/use-snackbar";
import { useEntityEditor } from "../../entity-editor-context";
import { ValueCell } from "./cells/value-cell/types";
import { propertyGridIndexes } from "./constants";
import { PropertyRow } from "./types";

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

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
        if (!key || !row) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
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
              entityId: entity.metadata.editionId.baseId as EntityId,
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
