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
} from "./catalog-metadata";
import { normalizeExampleDefinition } from "./normalize-example";

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
} from "./catalog-metadata";

export type LoadedExample = Readonly<{
  catalog: ExampleCatalogEntry;
  definition: SDCPN;
}>;

export type GeneratedExampleRuntime = Readonly<{
  hirArtifacts: HirArtifacts;
  scenarioHirById: Readonly<Record<string, ScenarioHir>>;
}>;

const modelLoaders: Record<ExampleSlug, () => Promise<{ default: unknown }>> = {
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
    "gases-1-pn-consumption-trigger": () =>
      import("./generated/gases-1-pn-consumption-trigger.json"),
    "gases-1-pn": () => import("./generated/gases-1-pn.json"),
    "gases-2-spn": () => import("./generated/gases-2-spn.json"),
    "gases-3-cpn": () => import("./generated/gases-3-cpn.json"),
    "gases-4-dcpn": () => import("./generated/gases-4-dcpn.json"),
    "semiconductor-fab-drift": () =>
      import("./generated/semiconductor-fab-drift.json"),
    "truck-fleet-predictive-maintenance": () =>
      import("./generated/truck-fleet-predictive-maintenance.json"),
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

  const loaded = modelLoaders[slug]().then((module) => {
    const parsed = parseSDCPNFile(module.default);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    const { title: _title, ...rawDefinition } = parsed.sdcpn;
    return {
      catalog: getExampleCatalogEntry(slug)!,
      definition: normalizeExampleDefinition(slug, rawDefinition),
    };
  });
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
