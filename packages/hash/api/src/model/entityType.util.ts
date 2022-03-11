import Ajv2019 from "ajv/dist/2019";
import addFormats from "ajv-formats";
import { JSONSchema } from "./entityType.model";

import { EntityType } from ".";
import { FRONTEND_URL } from "../lib/config";

export const JSON_SCHEMA_VERSION =
  "https://json-schema.org/draft/2019-09/schema";

/**
 * Generates a URI for a schema in a HASH instance.
 * $ids should use absolute URIs, and will need to be re-written if the origin changes.
 * $refs should use relative URIs, which can be resolved relative to the $id's origin.
 * If $refs used absolute URIs, they would need to be re-written if the origin changes also,
 *    which would be (a) more writes, and (b) more complex if a schema has $refs to external URIs.
 * @todo rewrite schema $ids when FRONTEND_URL config is changed.
 *    ideally this URL would be configurable in an admin panel and stored in the db.
 * */
export const generateSchema$id = (
  accountId: string,
  entityTypeId: string,
  relative: boolean = false,
) => {
  return `${relative ? "" : FRONTEND_URL}/${accountId}/types/${entityTypeId}`;
};

/**
 * Given a Schema$id, generate an appropriate $ref to put into allOf field on JSON schema.
 * This can be used to inherit from other schemas.
 * */
export const createSchema$idRef = (schema$id: string) => {
  return JSON.stringify([{ $ref: schema$id }]);
};

// The following types are internally used to validate JSON schemas.
type Property = {
  name: string;
  type: string;
  format?: string;
  description?: string;
  otherFields: Partial<JSONSchema>;
};

// If any property constraint has 'min' or 'max' in their name, it is a numeric constraint
// JSON Schema 4 would allow booleans for 'exclusiveMinimum' and 'exclusiveMaximum', though.
const CONSTRAINT_RE = /.*(min|max).*/i;

/**
 * When a 'minimim' constraint is defined twice on the same property (across multiple schemas),
 * the constraint should be 'maximized' such that the minimum is changed to the most permissive
 * value.
 */
const maximizeConstraint = Math.max;

/**
 * When a 'maximum' constraint is defined twice on the same property (across multiple schemas),
 * the constraint should be 'minimized' such that the maximum is changed to the least permissive
 * value.
 */
const minimizeConstraint = Math.min;

/**
 * All JSON Schema numeric constraints that we support validation for.
 */
type Constraint =
  | "exclusiveMaximum"
  | "exclusiveMinimum"
  | "maximum"
  | "minimum"
  | "maxItems"
  | "minItems"
  | "maxLength"
  | "minLength"
  | "maxProperties"
  | "minProperties";

/**
 * Mapping from constraint names to what kind of permissiveness that is required
 */
const propertyConstraintMerging: Record<
  Constraint | string,
  (...values: number[]) => number
> = {
  exclusiveMaximum: minimizeConstraint,
  exclusiveMinimum: maximizeConstraint,
  maximum: minimizeConstraint,
  minimum: maximizeConstraint,
  maxItems: minimizeConstraint,
  minItems: maximizeConstraint,
  maxLength: minimizeConstraint,
  minLength: maximizeConstraint,
  maxProperties: minimizeConstraint,
  minProperties: maximizeConstraint,
} as const;

/**
 * Traverse properties of a schema and convert to a {@link Property}
 *
 * @param schema JSON Schema that is to be traversed
 */
function extractProperties(schema: JSONSchema): Property[] {
  const properties: Property[] = [];

  for (const [field, value] of Object.entries(schema.properties ?? {})) {
    if (typeof value === "object") {
      const { type, format, description, ...otherFields } = value;
      if (typeof type === "string") {
        properties.push({
          name: field,
          type,
          format,
          description,
          otherFields,
        });
      }
    }
  }

  return properties;
}

/**
 * In JSON Schema, constraints can be put on numeric properties, this function validates that
 * pairs of constraints (minimum and maximum) do not span over a negative interval.
 *
 * Negative intervals can be a result of validating nested types that define the same property
 */
const validationConstraintPairs = (
  constraints: Record<string, number>,
): string[] => {
  const constraintErrors: string[] = [];

  const pairs: [Constraint, Constraint][] = [
    ["exclusiveMaximum", "exclusiveMinimum"],
    ["maximum", "minimum"],
    ["maxItems", "minItems"],
    ["maxLength", "minLength"],
    ["maxProperties", "minProperties"],
  ];

  for (const [maxKey, minKey] of pairs) {
    const max = constraints[maxKey];
    const min = constraints[minKey];

    if (max !== undefined && min !== undefined) {
      if (max < min) {
        constraintErrors.push(
          `Constraint '${minKey}' (${min}) to '${maxKey}' (${max}) defines a negative interval.`,
        );
      }
    }
  }

  return constraintErrors;
};

type PropertyWithConstraint = {
  property: Property;
  numberConstraints: Record<string, number>;
};

/**
 * This function type checks properties of the same name.
 * It is relevant when checking property types across inherited schemas.
 */
function validatePropertyType(
  property: Property,
  seenProperty: PropertyWithConstraint,
): string[] {
  if (property.type && property.type !== seenProperty.property.type) {
    return [
      `Type mismatch on "${property.name}". Got "${property.type}" expected "${seenProperty.property.type}"`,
    ];
  }

  return [];
}

function validateProperties(
  entityType: JSONSchema,
  existingErrors?: string[],
  alreadySeen?: Map<string, PropertyWithConstraint>,
) {
  const seen = alreadySeen ?? new Map();
  const errors = existingErrors ?? [];

  const properties = extractProperties(entityType);
  for (const property of properties) {
    const constraints: [string, number][] = Object.entries(
      property.otherFields,
      // Assumption is being made here about all "min" and "max" constraints being number values
    ).filter((prop): prop is [string, number] => CONSTRAINT_RE.test(prop[0]));

    if (seen.has(property.name)) {
      const seenProperty = seen.get(property.name)!;

      // First type check the pair of properties with the same name
      errors.push(...validatePropertyType(property, seenProperty));

      // Then validate that their constraints are compatible
      for (const [fieldName, fieldValue] of constraints) {
        const constraintNarrow = propertyConstraintMerging[fieldName];
        if (constraintNarrow) {
          const narrowedConstraint = constraintNarrow(
            fieldValue,
            seenProperty.numberConstraints[fieldName],
          );

          seenProperty.numberConstraints[fieldName] = narrowedConstraint;
        }
      }
      errors.push(...validationConstraintPairs(seenProperty.numberConstraints));
    } else {
      seen.set(property.name, {
        property,
        numberConstraints: Object.fromEntries(constraints),
      });
    }
  }
}

/**
 * Validate a collection of JSON schemas based on their properties.
 * For every schema given, any properties that overlap will be validated.
 *
 * Validation includes checking that types match and that constraints are not negative
 *
 * @param properties list of properties to duplicate check
 * @returns a list of type-mismatch errors. Does not throw an exception.
 */
export const entityTypePropertyKeyValidator = (
  ...schemas: (EntityType | JSONSchema)[]
): string[] => {
  const seen: Map<string, PropertyWithConstraint> = new Map();
  const errors: string[] = [];

  // Iterate all props, check for duplicates and throw an error if types mismatch
  for (const schema of schemas) {
    if (schema instanceof EntityType) {
      validateProperties(schema.properties, errors, seen);
    } else {
      validateProperties(schema, errors, seen);
    }
  }

  return errors;
};

/**
 * Extract all 'allOf' objects which contain '$ref' values
 *
 * @param schema the JSON Schema to extract '$ref's from.
 * @returns list of '$ref' values
 */
export const getSchemaAllOfRefs = (schema: JSONSchema) =>
  schema.allOf
    ?.filter(
      (allOfEntry): allOfEntry is { $ref: string } =>
        typeof allOfEntry === "object" && "$ref" in allOfEntry,
    )
    .map(({ $ref }) => $ref) ?? [];

const ajv = new Ajv2019({
  // stop AJV trying to add compiled schemas to the instance
  addUsedSchema: false,
  // At validation time, don't use the "proper" resolver.
  loadSchema: async () => ({}),
});

ajv.addKeyword({
  keyword: "componentId",
  schemaType: "string",
});

addFormats(ajv);

/**
 * Try to compile schema in order to find any errors.
 * This does not resolve references.
 */
export const compileAjvSchema = async (schema: JSONSchema) => {
  try {
    await ajv.compileAsync(schema);
  } catch (err: any) {
    throw new Error(`Error in provided type schema: ${(err as Error).message}`);
  }
};
