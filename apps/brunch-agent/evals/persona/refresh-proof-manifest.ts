import { resolve } from "node:path";

import { refreshProofManifest } from "./proof-artifacts.ts";

const argumentsAfterScript = process.argv.slice(2);
const [directory, ...unexpected] =
  argumentsAfterScript[0] === "--"
    ? argumentsAfterScript.slice(1)
    : argumentsAfterScript;
if (directory === undefined || unexpected.length > 0) {
  throw new Error(
    "usage: yarn workspace @apps/brunch-agent proof:manifest -- <attempt-directory>",
  );
}

const resolvedDirectory = resolve(directory);
const manifest = await refreshProofManifest(resolvedDirectory);
process.stdout.write(
  `PROOF_MANIFEST ${JSON.stringify({ directory: resolvedDirectory, files: manifest.files.length })}\n`,
);
