import type { EditableGridCell, Item } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { Entity } from "@local/hash-graph-sdk/entity";
import cloneDeep from "lodash/cloneDeep";
import set from "lodash/set";
import { useCallback } from "react";

import { useEntityEditor } from "../../entity-editor-context";
import type { ValueCell } from "./cells/value-cell/types";
import { propertyGridIndexes } from "./constants";
import type { PropertyRow } from "./types";

/**
 * This onCellEdited is used to handle editing the data only at `Values` column
 */
export const useCreateOnCellEdited = () => {
  const { entity, setEntity } = useEntityEditor();

  const createOnCellEdited = useCallback(
    (rows: PropertyRow[]) => {
      const onCellEdited = (
        [colIndex, rowIndex]: Item,
        newValue: EditableGridCell,
      ) => {
        if (newValue.kind !== GridCellKind.Custom) {
          return;
        }

        const valueCell = newValue as ValueCell;

        const key = propertyGridIndexes[colIndex];
        const row = rows[rowIndex];

        if (key !== "value") {
          // only "value" cell can be edited
          return;
        }

        if (!row) {
          throw new Error("row not found");
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

        setEntity(
          new Entity({
            ...entity.toJSON(),
            properties: updatedProperties,
          }),
        );
      };

      return onCellEdited;
    },
    [entity, setEntity],
  );

  return createOnCellEdited;
};
