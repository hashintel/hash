import _Ajv from "ajv";
import _addFormats from "ajv-formats";
import type { JSONSchema } from "openai/lib/jsonschema";

import { logger } from "../activity-logger.js";
import { stringify } from "../stringify.js";
import type { LlmToolDefinition } from "./types.js";

const Ajv = _Ajv as unknown as typeof _Ajv.default;
const addFormats = _addFormats as unknown as typeof _addFormats.default;

export const sanitizeInputBeforeValidation = (params: {
  input: object;
  toolDefinition: LlmToolDefinition;
}): object => {
  const { toolDefinition } = params;

  /**
   * Some LLM models may provide valid input, but in a nested `properties` object. If this is present,
   * and the tool definition does not specify a `properties` input, we can
   * attempt to gracefully handle this by extracting the input from the nested
   * `properties` object.
   */
  const input =
    "properties" in params.input &&
    typeof params.input.properties === "object" &&
    params.input.properties !== null &&
    !Object.keys(toolDefinition.inputSchema.properties ?? {}).includes(
      "properties",
    )
      ? params.input.properties
      : params.input;

  if (toolDefinition.sanitizeInputBeforeValidation) {
    try {
      const sanitizedInput =
        toolDefinition.sanitizeInputBeforeValidation(input);

      return sanitizedInput;
    } catch {
      /**
       * If an error occurs during sanitization, it likely means that the
       * sanitization function doesn't handle some incorrect version of the
       * input. In this case, we can proceed to the JSON Schema validation
       * step which should produce a more informative error message for the LLM.
       */
      logger.error(
        `Error sanitizing input before validation: ${stringify(input)}`,
      );
    }
  }

  return input;
};

let _ajv: InstanceType<typeof Ajv> | undefined;
const getValidator = () => {
  if (!_ajv) {
    _ajv = new Ajv();
    _ajv.addKeyword("label");
    addFormats(_ajv);
  }

  return _ajv;
};

const applyAdditionalPropertiesFalseToSchema = (params: {
  schema: JSONSchema;
}): JSONSchema => {
  const { schema } = params;

  if (typeof schema !== "object") {
    return schema;
  }

  if (schema.type === "object") {
    const updatedProperties = schema.properties
      ? Object.fromEntries(
          Object.entries(schema.properties).map(([key, value]) => [
            key,
            typeof value === "object"
              ? applyAdditionalPropertiesFalseToSchema({ schema: value })
              : value,
          ]),
        )
      : {};

    const updatedPatternProperties = schema.patternProperties
      ? Object.fromEntries(
          Object.entries(schema.patternProperties).map(([key, value]) => [
            key,
            typeof value === "object"
              ? applyAdditionalPropertiesFalseToSchema({ schema: value })
              : value,
          ]),
        )
      : {};

    return {
      ...schema,
      properties: updatedProperties,
      patternProperties: updatedPatternProperties,
      additionalProperties: false,
    };
  } else if (schema.type === "array" && schema.items) {
    return {
      ...schema,
      items:
        typeof schema.items === "object"
          ? Array.isArray(schema.items)
            ? schema.items.map((value) =>
                typeof value === "object"
                  ? applyAdditionalPropertiesFalseToSchema({ schema: value })
                  : value,
              )
            : applyAdditionalPropertiesFalseToSchema({ schema: schema.items })
          : schema.items,
    };
  }

  return schema;
};

export const getInputValidationErrors = (params: {
  input: object;
  toolDefinition: LlmToolDefinition;
}) => {
  const { input, toolDefinition } = params;

  const validator = getValidator();

  const validate = validator.compile(
    applyAdditionalPropertiesFalseToSchema({
      schema: toolDefinition.inputSchema,
    }),
  );

  const inputIsValid = validate(input);

  if (!inputIsValid) {
    logger.error(
      `Input did not match schema: ${stringify(validate.errors)} for tool: ${toolDefinition.name}`,
    );

    return validate.errors ?? [];
  }

  return null;
};
