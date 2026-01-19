import type { CodegenParameters } from "@blockprotocol/graph/codegen";
import { codegen } from "@blockprotocol/graph/codegen";
import type { VersionedUrl } from "@blockprotocol/type-system";

import {
  blockProtocolEntityTypes,
  googleEntityTypes,
  linearEntityTypes,
  systemEntityTypes,
} from "./ontology-type-ids.js";
import { slugify } from "./slugify.js";

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
    if (entityTypeId === blockProtocolEntityTypes.link.entityTypeId) {
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
    targets[`${slugify(name)}.ts`] = [{ sourceTypeId: entityTypeId }];
  }

  const logLevel = process.env.LOG_LEVEL ?? "info";

  await codegen(
    {
      outputFolder: `src/system-types${subFolder ? `/${subFolder}` : ""}`,
      targets,
      getFetchUrlFromTypeId: (typeId) => {
        if (typeId.startsWith("https://hash.ai/")) {
          const rewrittenTypeId = typeId.replace(
            "https://hash.ai/",
            "http://localhost:3000/",
          ) as VersionedUrl;

          return rewrittenTypeId;
        }
        return typeId;
      },
    },
    logLevel as Parameters<typeof codegen>[1],
  );

  // eslint-disable-next-line no-console
  console.log(`Done generating ${label} types.`);
};

/**
 * Generate TypeScript types for the system types. The API and frontend must be running, i.e. `yarn dev`
 */
const generateSystemTypeTypes = async () => {
  await generateTypes(systemEntityTypes, "system");
  await generateTypes(linearEntityTypes, "linear", "linear");
  await generateTypes(googleEntityTypes, "google", "google");
  await generateTypes(
    blockProtocolEntityTypes,
    "Block Protocol",
    "blockprotocol",
  );
};

void generateSystemTypeTypes();
