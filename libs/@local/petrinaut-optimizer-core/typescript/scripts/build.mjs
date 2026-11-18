import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { basename } from "node:path";

const pythonDirectory = new URL("../../python/", import.meta.url);
const outputDirectory = new URL("../dist/", import.meta.url);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(
  new URL("src/petrinaut_optimizer_core/", pythonDirectory),
  new URL("python/", outputDirectory),
  {
    recursive: true,
    filter: (source) => basename(source) !== "__pycache__",
  },
);
await copyFile(
  new URL("runtime-lock.json", pythonDirectory),
  new URL("runtime-lock.json", outputDirectory),
);
