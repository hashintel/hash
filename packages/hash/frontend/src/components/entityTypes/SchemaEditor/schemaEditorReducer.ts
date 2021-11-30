import produce from "immer";
import { get } from "lodash";
import { Reducer } from "react";
import { JsonSchema } from "../../../lib/json-utils";

type Action<S, T> = {
  type: S;
  payload: T & { pathToSubSchema?: string };
};

type SchemaEditorReducerAction =
  | Action<"addProperty", { newPropertyName: string }>
  | Action<"addSubSchema", { newSubSchemaName: string }>
  | Action<"togglePropertyIsArray", { propertyName: string }>
  | Action<"togglePropertyIsRequired", { propertyName: string }>
  | Action<
      "updatePropertyDescription",
      { propertyName: string; newPropertyDescription: string }
    >
  | Action<"updateSchemaDescription", { newSchemaDescription: string }>
  | Action<
      "updatePropertyName",
      { oldPropertyName: string; newPropertyName: string }
    >
  | Action<
      "updatePropertyPermittedType", // @todo allow for multiple types
      { propertyName: string; newType: string }
    >;

export type SchemaEditorDispatcher = (
  action: SchemaEditorReducerAction,
) => void;

const selectSubSchema = (
  schema: JsonSchema,
  pathToSubSchema: string | undefined,
): JsonSchema => (pathToSubSchema ? get(schema, pathToSubSchema) : schema);

export const schemaEditorReducer: Reducer<
  JsonSchema,
  SchemaEditorReducerAction
> = (schemaState, action) => {
  const { pathToSubSchema } = action.payload;

  // Get a reference to the target sub-schema, checked against to validate if action should be taken
  const subSchemaToCheck = selectSubSchema(schemaState, pathToSubSchema);

  if (pathToSubSchema && !subSchemaToCheck) {
    throw new Error(
      `Target sub-schema at path ${pathToSubSchema} does not exist.`,
    );
  }

  switch (action.type) {
    case "addProperty": {
      if (subSchemaToCheck.properties?.[action.payload.newPropertyName]) {
        // bail out to prevent people accidentally overwriting an existing property
        return schemaState;
      }
      return produce(schemaState, (draftRootSchema) => {
        const schemaToEdit = selectSubSchema(draftRootSchema, pathToSubSchema);
        schemaToEdit.properties ??= {};
        schemaToEdit.properties[action.payload.newPropertyName] = {
          type: "string",
        };
      });
    }

    case "addSubSchema": {
      if (subSchemaToCheck.$defs?.[action.payload.newSubSchemaName]) {
        // bail out to prevent people accidentally overwriting an existing sub-schema
        return schemaState;
      }
      return produce(schemaState, (draftRootSchema) => {
        const schemaToEdit = selectSubSchema(draftRootSchema, pathToSubSchema);
        schemaToEdit.$defs ??= {};
        schemaToEdit.$defs[action.payload.newSubSchemaName] = {
          type: "object",
        };
      });
    }

    case "togglePropertyIsArray": {
      return produce(schemaState, (draftRootSchema) => {
        const schemaToEdit = selectSubSchema(draftRootSchema, pathToSubSchema);

        const { propertyName } = action.payload;
        const propertyToReplace = schemaToEdit.properties?.[propertyName];
        if (!propertyToReplace) {
          throw new Error(`Property '${propertyName}' not found.`);
        }

        const replacementProperty: JsonSchema = {
          description: propertyToReplace.description,
        };
        const isCurrentlyArray = propertyToReplace.type === "array";
        if (isCurrentlyArray) {
          Object.assign(
            replacementProperty,
            Array.isArray(propertyToReplace.items)
              ? propertyToReplace.items[0] // @todo support multiple permitted types
              : propertyToReplace.items,
          );
          if (replacementProperty.$ref) {
            delete replacementProperty.type;
          }
        } else {
          replacementProperty.type = "array";
          replacementProperty.items = propertyToReplace;
          delete replacementProperty.items.description;
        }

        schemaToEdit.properties![propertyName] = replacementProperty;
      });
    }

    case "togglePropertyIsRequired": {
      return produce(schemaState, (draftRootSchema) => {
        const schemaToEdit = selectSubSchema(draftRootSchema, pathToSubSchema);

        const { propertyName } = action.payload;
        if (!schemaToEdit.properties?.[propertyName]) {
          throw new Error(`Property '${propertyName}' not found.`);
        }

        schemaToEdit.required = Array.isArray(schemaToEdit.required)
          ? schemaToEdit.required
          : [];
        if (schemaToEdit.required.includes(propertyName)) {
          schemaToEdit.required = schemaToEdit.required.filter(
            (name) => name !== propertyName,
          );
        } else {
          schemaToEdit.required.push(propertyName);
        }
      });
    }

    case "updatePropertyDescription": {
      const { propertyName, newPropertyDescription } = action.payload;

      if (
        newPropertyDescription ===
        subSchemaToCheck.properties?.[propertyName]?.description
      ) {
        return schemaState;
      } else if (!subSchemaToCheck.properties?.[propertyName]) {
        throw new Error(`Property '${propertyName}' not found.`);
      }

      return produce(schemaState, (draftRootSchema) => {
        const schemaToEdit = selectSubSchema(draftRootSchema, pathToSubSchema);
        schemaToEdit.properties![propertyName].description =
          newPropertyDescription;
      });
    }

    case "updatePropertyName": {
      const { oldPropertyName, newPropertyName } = action.payload;

      if (newPropertyName === oldPropertyName) {
        return schemaState;
      } else if (!subSchemaToCheck.properties?.[oldPropertyName]) {
        throw new Error(`Property '${oldPropertyName}' not found.`);
      }

      return produce(schemaState, (draftRootSchema) => {
        const schemaToEdit = selectSubSchema(draftRootSchema, pathToSubSchema);
        schemaToEdit.properties ??= {};
        schemaToEdit.properties[newPropertyName] =
          schemaToEdit.properties[oldPropertyName];
      });
    }

    case "updatePropertyPermittedType": {
      return produce(schemaState, (draftRootSchema) => {
        const schemaToEdit = selectSubSchema(draftRootSchema, pathToSubSchema);

        const { propertyName, newType } = action.payload;
        const propertyToEdit = schemaToEdit.properties?.[propertyName];
        if (!propertyToEdit) {
          throw new Error(`Property '${propertyName}' not found.`);
        }

        const isArray = propertyToEdit.type === "array";
        const isRef = /^(http|#|\/)/.test(newType);

        if (isArray) {
          if (isRef) {
            propertyToEdit.items = {
              $ref: newType,
            };
          } else {
            // @todo handle multiple permitted types
            propertyToEdit.items ??= {};
            (propertyToEdit.items as JsonSchema).type = newType;
          }
        } else if (isRef) {
          schemaToEdit.properties![propertyName] = {
            description: propertyToEdit.description,
            $ref: newType,
          };
        } else {
          propertyToEdit.type = newType;
          delete propertyToEdit.$ref;
        }
      });
    }

    case "updateSchemaDescription": {
      const { newSchemaDescription } = action.payload;

      if (newSchemaDescription === subSchemaToCheck.description) {
        return schemaState;
      }

      return produce(schemaState, (draftRootSchema) => {
        const schemaToEdit = selectSubSchema(draftRootSchema, pathToSubSchema);
        schemaToEdit.description = newSchemaDescription;
      });
    }

    default:
      throw new Error("Invalid action type passed to schemaEditorReducer.");
  }
};
