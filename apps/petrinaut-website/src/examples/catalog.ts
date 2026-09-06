/**
 * @layerRoot website.examples
 * @role Publishes example models and the URL contract every example surface speaks
 */

import {
  parseSDCPNFile,
  type HirArtifacts,
  type ScenarioHir,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  getExampleCatalogEntry,
  type ExampleCatalogEntry,
  type ExampleSlug,
  type ModelFileExampleSlug,
} from "./catalog-metadata";

export {
  exampleCatalog,
  exampleSlugs,
  getExampleCatalogEntry,
  isExampleSlug,
} from "./catalog-metadata";
export type {
  ExampleCatalogEntry,
  ExampleSimulationParameterBounds,
  ExampleSlug,
  ExampleSource,
} from "./catalog-metadata";

export type LoadedExample = Readonly<{
  catalog: ExampleCatalogEntry;
  definition: SDCPN;
}>;

export type GeneratedExampleRuntime = Readonly<{
  hirArtifacts: HirArtifacts;
  scenarioHirById: Readonly<Record<string, ScenarioHir>>;
}>;

const modelFileLoaders: Record<
  ModelFileExampleSlug,
  () => Promise<{ default: unknown }>
> = {
  "gases-1-pn-consumption-trigger": () =>
    import("./models/gases-1-pn-consumption-trigger.json"),
  "gases-1-pn": () => import("./models/gases-1-pn.json"),
  "gases-2-spn": () => import("./models/gases-2-spn.json"),
  "gases-3-cpn": () => import("./models/gases-3-cpn.json"),
  "gases-4-dcpn": () => import("./models/gases-4-dcpn.json"),
  "semiconductor-fab-drift": () =>
    import("./models/semiconductor-fab-drift.json"),
  "truck-fleet-predictive-maintenance": () =>
    import("./models/truck-fleet-predictive-maintenance.json"),
};

const runtimeLoaders: Record<ExampleSlug, () => Promise<{ default: unknown }>> =
  {
    "deployment-pipeline": () => import("./generated/deployment-pipeline.json"),
    "gases-1-pn-consumption-trigger": () =>
      import("./generated/gases-1-pn-consumption-trigger.json"),
    "gases-1-pn": () => import("./generated/gases-1-pn.json"),
    "gases-2-spn": () => import("./generated/gases-2-spn.json"),
    "gases-3-cpn": () => import("./generated/gases-3-cpn.json"),
    "gases-4-dcpn": () => import("./generated/gases-4-dcpn.json"),
    "probabilistic-satellite-launcher": () =>
      import("./generated/probabilistic-satellite-launcher.json"),
    "production-with-machine-failure": () =>
      import("./generated/production-with-machine-failure.json"),
    "semiconductor-fab-drift": () =>
      import("./generated/semiconductor-fab-drift.json"),
    "sir-epidemic-model": () => import("./generated/sir-epidemic-model.json"),
    "supply-chain-profit-model": () =>
      import("./generated/supply-chain-profit-model.json"),
    "supply-chain-with-disruption": () =>
      import("./generated/supply-chain-with-disruption.json"),
    "truck-fleet-predictive-maintenance": () =>
      import("./generated/truck-fleet-predictive-maintenance.json"),
  };

const loadModelFile = async (slug: ModelFileExampleSlug): Promise<SDCPN> => {
  const module = await modelFileLoaders[slug]();
  const parsed = parseSDCPNFile(module.default);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const { title: _title, ...definition } = parsed.sdcpn;
  return definition;
};

const loadDefinition = async (entry: ExampleCatalogEntry): Promise<SDCPN> => {
  switch (entry.source.kind) {
    case "model-file":
      return loadModelFile(entry.slug as ModelFileExampleSlug);
    case "core-example": {
      const examples = await import("@hashintel/petrinaut-core/examples");
      return examples[entry.source.exportName].petriNetDefinition;
    }
  }
};

const loadedExamples = new Map<ExampleSlug, Promise<LoadedExample>>();
const loadedRuntimes = new Map<ExampleSlug, Promise<GeneratedExampleRuntime>>();

export const loadExample = async (
  slug: ExampleSlug,
): Promise<LoadedExample> => {
  const existing = loadedExamples.get(slug);
  if (existing) {
    return existing;
  }

  const catalog = getExampleCatalogEntry(slug)!;
  const loaded = loadDefinition(catalog).then((definition) => ({
    catalog,
    definition,
  }));
  // A rejected import (a transient network failure, a stale chunk after a
  // redeploy) must not poison the cache: evict so the next navigation retries.
  loaded.catch(() => {
    loadedExamples.delete(slug);
  });
  loadedExamples.set(slug, loaded);
  return loaded;
};

export const loadExampleRuntime = async (
  slug: ExampleSlug,
): Promise<GeneratedExampleRuntime> => {
  const existing = loadedRuntimes.get(slug);
  if (existing) {
    return existing;
  }

  const loaded = runtimeLoaders[slug]().then(
    (module) => module.default as GeneratedExampleRuntime,
  );
  loaded.catch(() => {
    loadedRuntimes.delete(slug);
  });
  loadedRuntimes.set(slug, loaded);
  return loaded;
};
