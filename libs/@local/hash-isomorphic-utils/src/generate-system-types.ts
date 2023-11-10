import { codegen, CodegenParameters } from "@blockprotocol/graph/codegen";
import { VersionedUrl } from "@blockprotocol/type-system";
import slugify from "slugify";

import { blockProtocolTypes, systemTypes } from "./ontology-type-ids";
import { linearTypes } from "./ontology-types";

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
  await generateTypes(systemTypes.entityType, "system");
  await generateTypes(linearTypes.entityType, "linear", "linear");
  await generateTypes(
    blockProtocolTypes.entityType,
    "Block Protocol",
    "blockprotocol",
  );
};

void generateSystemTypeTypes();
