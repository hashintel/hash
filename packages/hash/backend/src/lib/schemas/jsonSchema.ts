import { validate } from "jsonschema";

export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | JSONObject;

export type JSONObject = { [key: string]: JSONValue };

/**
 * @todo read server name from server config or environment variable
 * @todo amend $schema strings when served from API to use current server host
 * */
const TEMPORARY_HOST_NAME = "https://hash.ai";

/**
 * Create a JSON schema
 * @param title the name of the schema, e.g. Person
 * @param accountId the account it belongs to
 * @param schema schema definition fields
 *    (e.g. 'properties', 'definition', 'description')
 * @param description optional description for the type
 * @returns schema the complete JSON schema object
 */
export const jsonSchema = (
  title: string,
  accountId: string,
  schema: string | JSONObject = {},
  description?: string
) => {
  if (title[0] !== title[0].toUpperCase()) {
    throw new Error(
      `Schema title should be in PascalCase, you passed '${title}'`
    );
  }

  if (typeof schema === "string") {
    schema = JSON.parse(schema);
  }

  try {
    validate(title, schema, { allowUnknownAttributes: false });
  } catch (err) {
    throw new Error("Error in provided schema: " + err.message);
  }

  return {
    ...(schema as JSONObject),
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${TEMPORARY_HOST_NAME}/${accountId}/${title.toLowerCase()}.schema.json`,
    title,
    type: "object",
    description,
  };
};
