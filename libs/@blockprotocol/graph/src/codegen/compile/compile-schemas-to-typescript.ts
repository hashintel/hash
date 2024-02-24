import {
  DataType,
  EntityType,
  PropertyType,
  validateVersionedUrl,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import {
  compile as compileJsonSchema,
  JSONSchema,
} from "json-schema-to-typescript";

import { mustBeDefined } from "../../shared/util/must-be-defined.js";
import { typedValues } from "../../shared/util/typed-object-iter.js";
import { CompileContext } from "../context.js";
import { CompiledTsType, redundantTypePlaceholder } from "../shared.js";

const compileIndividualSchemaToTypescript = async (
  type: DataType | PropertyType | EntityType,
  context: CompileContext,
): Promise<CompiledTsType> =>
  compileJsonSchema(type as JSONSchema, type.title, {
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
        },
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
