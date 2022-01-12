import { JSONObject } from "@hashintel/block-protocol";
import Ajv2019 from "ajv/dist/2019";
import addFormats from "ajv-formats";
import { FRONTEND_URL } from "../config";

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

export const ajv = new Ajv2019({
  addUsedSchema: false, // stop AJV trying to add compiled schemas to the instance
  loadSchema: checkExternalSchemaExists,
});

ajv.addKeyword({
  keyword: "componentId",
  schemaType: "string",
});

addFormats(ajv);

export const jsonSchemaVersion = "https://json-schema.org/draft/2019-09/schema";

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
) => `${relative ? "" : FRONTEND_URL}/${accountId}/types/${entityTypeId}`;

/**
 * Create a JSON schema
 * @param title the name of the schema, e.g. Person
 * @param accountId the account it belongs to
 * @param entityTypeId the entityId of this entityType
 * @param maybeStringifiedSchema schema definition fields (in either a JSON string or JS object)
 *    (e.g. 'properties', 'definition', 'description')
 * @param description optional description for the type
 * @returns schema the complete JSON schema object
 */
export const jsonSchema = async (
  title: string,
  accountId: string,
  entityTypeId: string,
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
    $schema: jsonSchemaVersion,
    $id: generateSchema$id(accountId, entityTypeId),
    title,
    type: partialSchema.type ?? "object",
    description: partialSchema.description ?? description,
  };

  try {
    await ajv.compileAsync(schema);
  } catch (err: any) {
    throw new Error(`Error in provided type schema: ${(err as Error).message}`);
  }

  return schema;
};
