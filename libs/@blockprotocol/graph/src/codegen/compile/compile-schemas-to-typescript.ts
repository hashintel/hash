import type { HTTPResolverOptions } from "@apidevtools/json-schema-ref-parser";
import type {
  DataType,
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { validateVersionedUrl } from "@blockprotocol/type-system";
import { compile as compileJsonSchema } from "json-schema-to-typescript";

import { mustBeDefined } from "../../util/must-be-defined.js";
import { typedValues } from "../../util/typed-entries.js";
import type { CompileContext } from "../context.js";
import type { CompiledTsType, JsonSchema } from "../shared.js";
import { redundantTypePlaceholder } from "../shared.js";

const compileIndividualSchemaToTypescript = async (
  type: DataType | PropertyType | EntityType | JsonSchema,
  context: CompileContext,
): Promise<CompiledTsType> =>
  compileJsonSchema(type as unknown as JsonSchema, type.title, {
    bannerComment: "",
    enableConstEnums: true,
    declareExternallyReferenced: true,
    strictIndexSignatures: true,
    additionalProperties: false,
    /* @todo - It seems to error without this */
    format: false,
    $refOptions: {
      dereference: {
        circular: true,
        // The typings are messed up in the library, so we have to provide an empty callback here which is overridden
        // in the library implementation
        onDereference: () => {},
      },
      resolve: {
        http: {
          safeUrlResolver: false,
          read({ url }) {
            if (validateVersionedUrl(url).type === "Err") {
              throw new Error(
                `Invalid URL in \`$ref\`, expected a Versioned URL of a type but encountered: ${url}`,
              );
            }
            // When the compiler encounters a $ref, we want to return a schema with the same `title` as we're going to
            // generate, but replace the schema with a placeholder string so we can easily strip the duplicate
            // definitions (as we're going to compile the definition for this type elsewhere)
            return {
              $id: url,
              title: mustBeDefined(context.allTypes[url as VersionedUrl]).title,
              const: redundantTypePlaceholder,
            };
          },
        } as HTTPResolverOptions,
      },
    },
  });

export const compileSchemasToTypescript = async (
  context: CompileContext,
): Promise<void> => {
  await Promise.all(
    typedValues(context.allTypes).map(async (type) => {
      context.logDebug(`Compiling schema for ${type.$id}...`);
      context.addCompiledTsType(
        type.$id,
        await compileIndividualSchemaToTypescript(type, context),
      );
    }),
  );
};
