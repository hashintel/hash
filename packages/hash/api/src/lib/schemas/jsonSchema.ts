import { JSONObject } from "@hashintel/block-protocol";
import Ajv2019 from "ajv/dist/2019";
import addFormats from "ajv-formats";

/**
 * When compiling a schema AJV wants to resolve $refs to other schemas.
 * For now we can just give it empty schemas as the resolution for those $refs.
 * @todo check that $refs point to URIs which return at least valid JSON.
 *    We might not want to check each is a valid schema as they might link on to many more.
 *    For schemas stored in HASH, we know they're valid (since each is checked on insert).
 */
const checkExternalSchemaExists = async (_uri: string) => {
  return {};
};

export const ajv = new Ajv2019({ loadSchema: checkExternalSchemaExists });
addFormats(ajv);

/**
 * @todo read server name from server config or environment variable
 * @todo amend $schema strings when served from API to use current server host
 * */
const TEMPORARY_HOST_NAME = "https://hash.ai";

/**
 * Create a JSON schema
 * @param title the name of the schema, e.g. Person
 * @param accountId the account it belongs to
 * @param maybeStringifiedSchema schema definition fields (in either a JSON string or JS object)
 *    (e.g. 'properties', 'definition', 'description')
 * @param description optional description for the type
 * @returns schema the complete JSON schema object
 */
export const jsonSchema = async (
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

  const partialSchema: JSONObject =
    typeof maybeStringifiedSchema === "string"
      ? JSON.parse(maybeStringifiedSchema)
      : maybeStringifiedSchema;

  const schema = {
    ...partialSchema,
    $schema: "https://json-schema.org/draft/2019-09/schema",
    $id: `${TEMPORARY_HOST_NAME}/${accountId}/${title.toLowerCase()}.schema.json`,
    title,
    type: partialSchema.type ?? "object",
    description: partialSchema.description ?? description,
  };

  try {
    await ajv.compileAsync(schema);
  } catch (err: any) {
    if (err.message.match(/key.+already exists/)) {
      throw new Error(
        `Type name ${title} is not unique in accountId ${accountId}`,
      );
    }
    throw new Error(`Error in provided type schema: ${(err as Error).message}`);
  }

  return schema;
};
