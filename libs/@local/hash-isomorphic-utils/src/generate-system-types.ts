// We need to import this file to load the environment variables –– ontology-types.ts relies on SYSTEM_USER_SHORTNAME.
// This script is used in the backend only, but the outputs are used in the frontend, thus the following eslint-disable.
// eslint-disable-next-line no-restricted-imports
import "@local/hash-backend-utils/environment";

import { codegen, CodegenParameters } from "@blockprotocol/graph/codegen";
import slugify from "slugify";

import { types } from "./ontology-types";

/**
 * Generate TypeScript types for the system types. The API and frontend must be running, i.e. `yarn dev`
 */
const systemTypes = Object.entries(types.entityType);
const generateSystemTypeTypes = async () => {
  const targets: CodegenParameters["targets"] = {};

  // eslint-disable-next-line no-console
  console.log(
    `Generating TypeScript types for system types: ${systemTypes
      .map(([name]) => name)
      .join(", ")}`,
  );

  for (const [name, { entityTypeId }] of systemTypes) {
    targets[`${slugify(name, { strict: true, lower: true })}.ts`] = [
      { sourceTypeId: entityTypeId },
    ];
  }

  await codegen({
    outputFolder: "src/system-types",
    targets,
  });

  // eslint-disable-next-line no-console
  console.log("Done generating types.");
};

void generateSystemTypeTypes();
