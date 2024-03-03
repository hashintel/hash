import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import { createRequire } from "node:module";

import { bundleWorkflowCode } from "@temporalio/worker";

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
