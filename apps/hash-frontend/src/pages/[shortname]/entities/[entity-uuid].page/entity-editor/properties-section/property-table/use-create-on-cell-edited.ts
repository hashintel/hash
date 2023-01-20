import {
  EditableGridCell,
  GridCellKind,
  Item,
} from "@glideapps/glide-data-grid";
import { getRoots } from "../hash-subgraph/src/stdlib/roots";
import { cloneDeep, set } from "lodash";
import { useCallback } from "react";

import { useEntityEditor } from "../../entity-editor-context";
import { ValueCell } from "./cells/value-cell/types";
import { propertyGridIndexes } from "./constants";
import { PropertyRow } from "./types";

/**
 * This onCellEdited is used to handle editing the data only at `Values` column
 */
export const useCreateOnCellEdited = () => {
  const { entitySubgraph, setEntity } = useEntityEditor();

  const createOnCellEdited = useCallback(
    (rows: PropertyRow[]) => {
      const onCellEdited = (
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

        setEntity({
          ...entity,
          properties: updatedProperties,
        });
      };

      return onCellEdited;
    },
    [entitySubgraph, setEntity],
  );

  return createOnCellEdited;
};
