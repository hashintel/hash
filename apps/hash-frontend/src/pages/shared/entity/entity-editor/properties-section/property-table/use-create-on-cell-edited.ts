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
        newValueCellOldType: EditableGridCell,
      ) => {
        if (newValueCellOldType.kind !== GridCellKind.Custom) {
          return;
        }

        const newValueCell = newValueCellOldType as ValueCell;

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

        const updatedMetadata = cloneDeep(entity.metadata);

        const { propertyKeyChain, value: previousValue } = row;

        const newValue = newValueCell.data.propertyRow.value;

        if (previousValue === newValue) {
          return;
        }

        /**
         * we're reaching to the nested property by the property keys array
         * so we can update the deeply nested properties,
         * by using keys pathing to specific property called `propertyKeyChain`
         */
        set(
          updatedProperties,
          propertyKeyChain,
          newValueCell.data.propertyRow.value,
        );

        const metadataKeyChain: (string | number)[] = [];
        for (let i = 0; i < propertyKeyChain.length; i++) {
          if (
            typeof propertyKeyChain[i - 1] === "string" &&
            typeof propertyKeyChain[i] === "string"
          ) {
            /**
             * Property object metadata has metadata on its properties nested under a 'value' key,
             * so we need to insert 'value' when both the previous and this key is a string,
             * indicating a nested property.
             *
             * e.g. metadata for a property object might look like this
             * {
             *   https://example.com/property-types/address/: {
             *     value: {
             *       https://example.com/property-types/street/: {
             *         metadata: {
             *           dataTypeId: "https://example.com/data-types/text/v/1"
             *         }
             *       }
             *     }
             *   }
             * }
             */
            metadataKeyChain.push("value");
          }
          metadataKeyChain.push(propertyKeyChain[i]!);
        }

        set(
          updatedMetadata,
          ["properties", "value", ...metadataKeyChain],
          newValueCell.data.propertyRow.valueMetadata,
        );

        setEntity(
          new Entity({
            ...entity.toJSON(),
            metadata: updatedMetadata,
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
