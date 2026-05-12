import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { SDCPN } from "../core/types/sdcpn";

export type PetrinautExample = {
  title: string;
  petriNetDefinition: SDCPN;
};

export type LoadedPetrinautExample = PetrinautExample & {
  fileName: string;
  filePath: string;
};

const examplesDirectoryPath = fileURLToPath(
  new URL("../examples/", import.meta.url),
);

function isPetrinautExample(value: unknown): value is PetrinautExample {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { title?: unknown }).title === "string" &&
    typeof (value as { petriNetDefinition?: unknown }).petriNetDefinition ===
      "object" &&
    (value as { petriNetDefinition?: unknown }).petriNetDefinition !== null
  );
}

async function loadExampleFromFile(
  fileName: string,
): Promise<LoadedPetrinautExample | null> {
  const filePath = join(examplesDirectoryPath, fileName);
  const exampleModule = (await import(pathToFileURL(filePath).href)) as Record<
    string,
    unknown
  >;
  const example = Object.values(exampleModule).find(isPetrinautExample);

  if (!example) {
    return null;
  }

  return {
    ...example,
    fileName,
    filePath,
  };
}

export async function loadPetrinautExamples(): Promise<
  LoadedPetrinautExample[]
> {
  const fileNames = (await readdir(examplesDirectoryPath))
    .filter((fileName) => fileName.endsWith(".ts"))
    .filter((fileName) => !fileName.endsWith(".test.ts"))
    .sort((a, b) => a.localeCompare(b));

  const examples = await Promise.all(fileNames.map(loadExampleFromFile));

  return examples.filter((example): example is LoadedPetrinautExample =>
    Boolean(example),
  );
}
