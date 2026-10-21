import { codegen } from "@blockprotocol/graph/codegen";

import {
  blockProtocolEntityTypes,
  googleEntityTypes,
  linearEntityTypes,
  systemEntityTypes,
} from "./ontology-type-ids.js";
import { slugify } from "./slugify.js";

import type { CodegenParameters } from "@blockprotocol/graph/codegen";
import type { VersionedUrl } from "@blockprotocol/type-system";

const generateTypes = async ({
  typeMap,
  label,
  subFolder,
}: {
  typeMap: Record<string, { entityTypeId: VersionedUrl }>;
  label: string;
  subFolder?: string;
}): Promise<void> => {
  const targets: CodegenParameters["targets"] = {};

  const typesToGenerate = Object.entries(typeMap);

  // eslint-disable-next-line no-console -- CLI script reports progress on stdout
  console.log(
    `Generating TypeScript types for ${label} types: ${typesToGenerate
      .map(([name]) => name)
      .join(", ")}`,
  );

  for (const [name, { entityTypeId }] of typesToGenerate) {
    /**
     * We don't have a use-case for generating the TS types
     * for the link entity type yet, but this also breaks the
     * codegen script because it throws an error when consuming
     * entity types with no properties.
     *
     * @todo fix the codegen script to gracefully handle entity types with no properties
     * @see https://linear.app/hash/issue/H-1402/fix-the-codegen-script-to-handle-entity-types-with-no-properties
     */
    if (entityTypeId !== blockProtocolEntityTypes.link.entityTypeId) {
      targets[`${slugify(name)}.ts`] = [{ sourceTypeId: entityTypeId }];
    }
  }

  const logLevel = process.env.LOG_LEVEL ?? "info";

  await codegen(
    {
      outputFolder: `src/system-types${subFolder !== undefined && subFolder !== "" ? `/${subFolder}` : ""}`,
      targets,
      getFetchUrlFromTypeId: (typeId): VersionedUrl => {
        if (typeId.startsWith("https://hash.ai/")) {
          // SAFETY: swapping the origin of a versioned URL yields another versioned URL.
          const rewrittenTypeId = typeId.replace(
            "https://hash.ai/",
            "http://localhost:3000/",
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- string replace widens the template literal type to string
          ) as VersionedUrl;

          return rewrittenTypeId;
        }
        return typeId;
      },
    },
    // SAFETY: the LOG_LEVEL environment variable is documented to hold a codegen log level.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- environment variables are plain strings
    logLevel as Parameters<typeof codegen>[1],
  );

  // eslint-disable-next-line no-console -- CLI script reports progress on stdout
  console.log(`Done generating ${label} types.`);
};

/**
 * Generate TypeScript types for the system types. The API and frontend must be running, i.e. `yarn dev`
 */
const generateSystemTypeTypes = async (): Promise<void> => {
  await generateTypes({ typeMap: systemEntityTypes, label: "system" });
  await generateTypes({
    typeMap: linearEntityTypes,
    label: "linear",
    subFolder: "linear",
  });
  await generateTypes({
    typeMap: googleEntityTypes,
    label: "google",
    subFolder: "google",
  });
  await generateTypes({
    typeMap: blockProtocolEntityTypes,
    label: "Block Protocol",
    subFolder: "blockprotocol",
  });
};

await generateSystemTypeTypes();
