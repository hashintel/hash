// We need to import this file to load the environment variables –– ontology-types.ts relies on SYSTEM_USER_SHORTNAME.
// This script is used in the backend only, but the outputs are used in the frontend, thus the following eslint-disable.
// eslint-disable-next-line no-restricted-imports
import "@local/hash-backend-utils/environment";

import { codegen, CodegenParameters } from "@blockprotocol/graph/codegen";
import slugify from "slugify";

import {
  blockProtocolTypes,
  EntityTypeDefinition,
  linearTypes,
  systemTypes,
} from "./ontology-types";

const generateTypes = async (
  typeMap: Record<string, EntityTypeDefinition>,
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
  await generateTypes(blockProtocolTypes, "Block Protocol", "blockprotocol");
};

void generateSystemTypeTypes();
