import { JSONObject } from "@hashintel/block-protocol";
import Ajv2019 from "ajv/dist/2019";

export const ajv = new Ajv2019();

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
  maybeStringifiedSchema: string | JSONObject = {},
  description?: string,
) => {
  if (title[0] !== title[0].toUpperCase()) {
    throw new Error(
      `Schema title should be in PascalCase, you passed '${title}'`,
    );
  }

  const schema: JSONObject =
    typeof maybeStringifiedSchema === "string"
      ? JSON.parse(maybeStringifiedSchema)
      : maybeStringifiedSchema;

  try {
    ajv.compile(schema);
  } catch (err: any) {
    throw new Error(`Error in provided schema: ${(err as Error).message}`);
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
