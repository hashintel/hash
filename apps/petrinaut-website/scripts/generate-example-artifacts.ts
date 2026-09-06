import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileScenario,
  parseSDCPNFile,
  type SDCPN,
} from "@hashintel/petrinaut-core";
import * as coreExamples from "@hashintel/petrinaut-core/examples";
import {
  compileHirArtifacts,
  lowerScenarioToHir,
  type ScenarioHir,
} from "@hashintel/petrinaut-core/hir";

import {
  exampleCatalog,
  type ExampleCatalogEntry,
} from "../src/examples/catalog-metadata.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const examplesDirectory = resolve(scriptDirectory, "../src/examples");
const modelsDirectory = resolve(examplesDirectory, "models");
const generatedDirectory = resolve(examplesDirectory, "generated");

const readModelFile = async (slug: string): Promise<SDCPN> => {
  const input = JSON.parse(
    await readFile(resolve(modelsDirectory, `${slug}.json`), "utf8"),
  ) as unknown;
  const parsed = parseSDCPNFile(input);
  if (!parsed.ok) {
    throw new Error(`${slug}: ${parsed.error}`);
  }
  const { title: _title, ...definition } = parsed.sdcpn;
  return definition;
};

const loadDefinition = (entry: ExampleCatalogEntry): Promise<SDCPN> => {
  switch (entry.source.kind) {
    case "model-file":
      return readModelFile(entry.slug);
    case "core-example":
      return Promise.resolve(
        coreExamples[entry.source.exportName].petriNetDefinition,
      );
  }
};

const generateRuntime = async (entry: ExampleCatalogEntry) => {
  const { slug } = entry;
  const definition = await loadDefinition(entry);
  const { artifacts, failures } = compileHirArtifacts(definition);
  if (failures.length > 0) {
    throw new Error(
      `${slug}: model HIR compilation failed:\n${failures
        .map(
          (failure) => `${failure.kind}:${failure.itemId}: ${failure.message}`,
        )
        .join("\n")}`,
    );
  }

  const scenarioHirById: Record<string, ScenarioHir> = Object.create(
    null,
  ) as Record<string, ScenarioHir>;
  for (const scenario of definition.scenarios ?? []) {
    const hir = lowerScenarioToHir({
      parameterOverrides: scenario.parameterOverrides,
      initialState: scenario.initialState,
    });
    const outcome = compileScenario(
      scenario,
      hir,
      definition.parameters,
      definition.places,
      definition.types,
    );
    if (!outcome.ok) {
      throw new Error(
        `${slug}/${scenario.id}: scenario compilation failed:\n${outcome.errors
          .map((error) => error.message)
          .join("\n")}`,
      );
    }
    scenarioHirById[scenario.id] = hir;
  }

  return `${JSON.stringify({ hirArtifacts: artifacts, scenarioHirById }, null, 2)}\n`;
};

await mkdir(generatedDirectory, { recursive: true });

for (const entry of exampleCatalog) {
  const outputPath = resolve(generatedDirectory, `${entry.slug}.json`);
  await writeFile(outputPath, await generateRuntime(entry), "utf8");
  process.stdout.write(`generated ${outputPath}\n`);
}
