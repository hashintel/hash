import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { bundleWorkflowCode } from "@temporalio/worker";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);

async function bundle() {
  const { code } = await bundleWorkflowCode({
    workflowsPath: require.resolve("../src/workflows"),
  });
  const codePath = path.join(__dirname, "../dist/workflow-bundle.js");

  await writeFile(codePath, code);
  console.log(`Bundle written to ${codePath}`);
}

bundle().catch((err) => {
  console.error(err);
  process.exit(1);
});
