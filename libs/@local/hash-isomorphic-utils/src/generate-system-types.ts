import { codegen, CodegenParameters } from "@blockprotocol/graph/codegen";
import { VersionedUrl } from "@blockprotocol/type-system";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import slugify from "slugify";

import {
  blockProtocolEntityTypes,
  linearEntityTypes,
  systemEntityTypes,
} from "./ontology-type-ids";

const generateTypes = async (
  typeMap: Record<string, { entityTypeId: VersionedUrl }>,
  label: string,
  subFolder?: string,
) => {
  const targets: CodegenParameters["targets"] = {};

  const typesToGenerate = Object.entries(typeMap);

  // eslint-disable-next-line no-console
  console.log(
    `Generating TypeScript types for ${label} types: ${typesToGenerate
      .map(([name]) => name)
      .join(", ")}`,
  );

  for (const [name, { entityTypeId }] of typesToGenerate) {
    if (entityTypeId === linkEntityTypeUrl) {
      /**
       * We don't have a use-case for generating the TS types
       * for the link entity type yet, but this also breaks the
       * codegen script because it throws an error when consuming
       * entity types with no properties.
       *
       * @todo fix the codegen script to gracefully handle entity types with no properties
       * @see https://linear.app/hash/issue/H-1402/fix-the-codegen-script-to-handle-entity-types-with-no-properties
       */
      continue;
    }
    targets[`${slugify(name, { strict: true, lower: true })}.ts`] = [
      { sourceTypeId: entityTypeId },
    ];
  }

  await codegen({
    outputFolder: `src/system-types${subFolder ? `/${subFolder}` : ""}`,
    targets,
    rewriteTypeId: (typeId) => {
      if (typeId.startsWith("https://hash.ai/")) {
        const rewrittenTypeId = typeId.replace(
          "https://hash.ai/",
          "http://localhost:3000/",
        ) as VersionedUrl;

        return rewrittenTypeId;
      }
      return typeId;
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Done generating ${label} types.`);
};

/**
 * Generate TypeScript types for the system types. The API and frontend must be running, i.e. `yarn dev`
 *
 * Note that because part of the system type definitions depend on an environment variable (the frontend origin),
 * you cannot use these types to check the correct value of keys and values that are URLs – they might be different at runtime.
 */
const generateSystemTypeTypes = async () => {
  await generateTypes(systemEntityTypes, "system");
  await generateTypes(linearEntityTypes, "linear", "linear");
  await generateTypes(
    blockProtocolEntityTypes,
    "Block Protocol",
    "blockprotocol",
  );
};

void generateSystemTypeTypes();
