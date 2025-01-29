import { mustHaveAtLeastOne } from "@blockprotocol/type-system";
import type { FunctionDeclarationSchema, Schema } from "@google-cloud/vertexai";
import { SchemaType } from "@google-cloud/vertexai";
import type { JSONSchema } from "openai/lib/jsonschema.mjs";

import type { DereferencedPropertyType } from "../../dereference-entity-type.js";
import type { LlmToolDefinition } from "../types.js";

/**
 * The Vertex AI controlled generation (i.e. output) schema supports a subset of the Vertex AI schema fields,
 * which are themselves a subset of OpenAPI schema fields.
 *
 * Any fields which are supported by Vertex AI but not by controlled generation will be IGNORED.
 * Any fields which are not supported by Vertex AI will result in the request being REJECTED.
 *
 * We want to exclude the fields which will be REJECTED, i.e. are not supported at all by Vertex AI
 *
 * The fields which are IGNORED we allow through. Controlled generation may support them in future,
 * in which case they will automatically start to be accounted for.
 *
 * The fields which are rejected we need to manually remove from this list when we discover that Vertex AI now supports them.
 *
 * There are some fields which are not listed here but instead handled specially in {@link transformSchemaForGoogle},
 * because we can rewrite them to constrain the output (e.g. 'const' can become an enum with a single option).
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output
 */
const vertexSchemaUnsupportedFields = ["$id", "multipleOf", "pattern"] as const;

/**
 * These are special fields we use in HASH but do not appear in any JSON Schema spec.
 * They will never be supported in Vertex AI, so we must remove them.
 */
const nonStandardSchemaFields = [
  "abstract",
  "titlePlural",
  "kind",
  "labelProperty",
  "inverse",
];

const fieldsToExclude = [
  ...vertexSchemaUnsupportedFields,
  ...nonStandardSchemaFields,
];

/**
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output#fields
 */
const vertexSupportedFormatValues = ["date", "date-time", "duration", "time"];

type JsonSchemaPart = NonNullable<
  LlmToolDefinition["inputSchema"]["properties"]
>[string];

type SchemaValue = JSONSchema[keyof JSONSchema];

function assertNonBoolean<T>(value: T): asserts value is Exclude<T, boolean> {
  if (typeof value === "boolean") {
    throw new Error("Schema is a boolean");
  }
}

export const rewriteSchemaPart = (schema: JsonSchemaPart): Schema => {
  assertNonBoolean(schema);

  const result: Schema = {};

  for (const [uncheckedKey, value] of Object.entries(
    schema as Record<string, SchemaValue>,
  )) {
    const key = uncheckedKey === "oneOf" ? "anyOf" : uncheckedKey;

    if (key === "format" && typeof value === "string") {
      if (vertexSupportedFormatValues.includes(value)) {
        result[key] = value;
      } else {
        continue;
      }
    }

    if (key === "type" && typeof value === "string") {
      if (value === "null") {
        /**
         * Google doesn't support type: "null", instead it supports nullable: boolean;
         */
        throw new Error(
          "type: 'null' is not supported. This should have been addressed by schema transformation.",
        );
      } else {
        // Google wants the type to be uppercase for some reason
        result[key] = value.toUpperCase() as SchemaType;
      }
    } else if (fieldsToExclude.includes(key)) {
      if (typeof value === "object" && value !== null) {
        /**
         * If the value is an object, this might well be a property which happens to have the same simplified key
         * as one of our rejected fields.
         */
        if ("title" in value || "titlePlural" in value) {
          /**
           * This is the 'inverse' field, the only one of our excluded fields which has an object value.
           */
          continue;
        }
        // @ts-expect-error -- @todo fix this
        result[key] = rewriteSchemaPart(value);
      }

      /**
       * If the value is not an object, we have one of our fields which will be rejected,
       * not a schema.
       */
      continue;
    } else if (typeof value === "object" && value !== null) {
      if (
        "oneOf" in value &&
        (value as NonNullable<JSONSchema["oneOf"]>).find((option) => {
          if (typeof option === "object" && "type" in option) {
            return option.type === "null";
          }
          return false;
        })
      ) {
        /**
         * Google doesn't support type: "null", instead it supports nullable: boolean;
         * We need to transform any schema containing oneOf to add nullable: true to all its options.
         */
        const newOneOf = (value as DereferencedPropertyType).oneOf
          .filter((option) => "type" in option && option.type !== "null")
          .map((option: DereferencedPropertyType["oneOf"][number]) => ({
            ...option,
            nullable: true,
          }));

        if (newOneOf.length === 0) {
          /**
           * The Vertex AI schema requires that a schema has at least one type field,
           * but does not support 'null' as a type (instead you must pass nullable: true).
           * Therefore if someone happens to define a property type which ONLY accepts null,
           * there is no way to represent this in the Vertex AI schema.
           *
           * If we define a type it will incorrect be constrainted to '{type} | null'.
           */
          throw new Error(
            "Property type must have at least one option which is not null",
          );
        }

        (value as DereferencedPropertyType).oneOf =
          mustHaveAtLeastOne(newOneOf);
      }

      // @ts-expect-error -- @todo fix this
      result[key] = rewriteSchemaPart(value);
    } else {
      // @ts-expect-error -- @todo fix this
      result[key] = value;
    }
  }
  return result;
};

export const rewriteSchemaForGoogle = (
  schema: LlmToolDefinition["inputSchema"],
): FunctionDeclarationSchema => {
  const properties: FunctionDeclarationSchema["properties"] = {};

  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    properties[key] = rewriteSchemaPart(value);
  }

  return {
    description: schema.description,
    type: SchemaType.OBJECT,
    properties,
    required: schema.required,
  };
};
