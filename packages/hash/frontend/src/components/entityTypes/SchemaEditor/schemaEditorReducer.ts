import produce, { Draft } from "immer";
import { Schema } from "jsonschema";
import { get } from "lodash";
import { Reducer } from "react";
import { JsonSchema } from "@hashintel/hash-shared/json-utils";

type Action<S, T> = {
  type: S;
  payload: T & { pathToSubSchema?: string };
};

export type SchemaEditorReducerAction =
  | Action<"addProperty", { newPropertyName: string }>
  | Action<"addSubSchema", { newSubSchemaName: string }>
  | Action<"deleteProperty", { propertyName: string }>
  | Action<"deleteSubSchema", { subSchemaName: string }>
  | Action<"init", { schema: JsonSchema }>
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

const selectSubSchema = <T extends JsonSchema | Draft<JsonSchema>>(
  schema: T,
  pathToSubSchema: string | undefined,
): T => (pathToSubSchema ? get(schema, pathToSubSchema) : schema);

const updatePropertyType = <T extends JsonSchema | Draft<JsonSchema>>(
  schemaToEdit: T,
  propertyName: string,
  newType: string,
): Schema => {
  let propertyToEdit = schemaToEdit.properties?.[propertyName];

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
      delete (propertyToEdit.items as JsonSchema).$ref;
    }
  } else if (isRef) {
    propertyToEdit = {
      description: propertyToEdit.description,
      $ref: newType,
    };
  } else {
    propertyToEdit.type = newType;
    delete propertyToEdit.$ref;
  }

  return propertyToEdit;
};

const getDependentProperties = (
  properties:
    | {
        [name: string]: Schema;
      }
    | undefined,
  subSchemaNameToDelete: string,
  prefix?: string,
) => {
  const dependentProperties = [];

  for (const propertyName of Object.keys(properties ?? {})) {
    const property = properties?.[propertyName];

    // @todo revisit when we have multiple types
    // @todo also check for properties of type "object" and check that object's properties
    if (
      property?.$ref?.includes(subSchemaNameToDelete) ||
      (Array.isArray(property?.items)
        ? property?.items[0]?.$ref?.includes(subSchemaNameToDelete)
        : property?.items?.$ref?.includes(subSchemaNameToDelete))
    ) {
      dependentProperties.push(prefix ? [prefix, propertyName] : propertyName);
    }
  }

  return dependentProperties;
};

// returns propertyname as string or path to propertyname as string[]
export const getSubschemaDependentProperties = <
  T extends JsonSchema | Draft<JsonSchema>,
>(
  schema: T,
  subSchemaNameToDelete: string,
): (string | string[])[] => {
  const { properties, $defs } = schema;

  const dependentProperties = [];

  dependentProperties.push(
    ...getDependentProperties(properties, subSchemaNameToDelete),
  );

  for (const subSchemaName of Object.keys(($defs as T["$defs"]) ?? {})) {
    if (subSchemaName === subSchemaNameToDelete) {
      continue;
    }

    // @ts-expect-error Recursive type checking issue - TODO figure out a better solution than ignoring
    const { properties: subschemaProperties } = $defs?.[subSchemaName] ?? {};

    dependentProperties.push(
      ...getDependentProperties(
        subschemaProperties,
        subSchemaNameToDelete,
        subSchemaName,
      ),
    );
  }

  return dependentProperties;
};

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

    case "deleteProperty": {
      return produce(schemaState, (draftRootSchema) => {
        const schemaToEdit = selectSubSchema(draftRootSchema, pathToSubSchema);
        schemaToEdit.properties ??= {};

        delete schemaToEdit.properties[action.payload.propertyName];
      });
    }

    case "deleteSubSchema": {
      return produce(schemaState, (draftRootSchema) => {
        const { subSchemaName: subSchemaNameToDelete } = action.payload;
        const { $defs } = draftRootSchema;

        const dependentProperties = getSubschemaDependentProperties(
          draftRootSchema,
          subSchemaNameToDelete,
        );

        dependentProperties.forEach((dependentProperty) => {
          // Update the subschema property
          if (Array.isArray(dependentProperty)) {
            return updatePropertyType(
              $defs![dependentProperty[0]!]!,
              dependentProperty[1]!,
              "string",
            );
          }

          // Update the schema property
          updatePropertyType(draftRootSchema, dependentProperty, "string");
        });

        draftRootSchema.$defs ??= {};
        delete draftRootSchema.$defs[subSchemaNameToDelete];
      });
    }

    case "init": {
      return action.payload.schema;
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
        schemaToEdit.properties![propertyName]!.description =
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
          schemaToEdit.properties[oldPropertyName]!;
        delete schemaToEdit.properties[oldPropertyName];
      });
    }

    case "updatePropertyPermittedType": {
      return produce(schemaState, (draftRootSchema) => {
        const schemaToEdit = selectSubSchema(draftRootSchema, pathToSubSchema);

        const { propertyName, newType } = action.payload;

        if (!schemaToEdit.properties?.[propertyName]) {
          throw new Error(`Property '${propertyName}' not found.`);
        }

        schemaToEdit.properties[propertyName] = updatePropertyType(
          schemaToEdit,
          propertyName,
          newType,
        );
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
