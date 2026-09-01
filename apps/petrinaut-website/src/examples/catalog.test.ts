import { describe, expect, it } from "vitest";

import {
  exampleCatalog,
  exampleSlugs,
  loadExample,
  loadExampleRuntime,
} from "./catalog";

describe("example catalog", () => {
  it("has a catalog entry for every slug", () => {
    // isExampleSlug gates the routes on exampleSlugs while loadExample
    // resolves the entry with a non-null assertion; this pins the two lists
    // to each other so a slug without an entry fails here, not at render.
    expect(exampleCatalog.map((entry) => entry.slug).toSorted()).toEqual(
      [...exampleSlugs].toSorted(),
    );
  });

  it.each(exampleCatalog)(
    "loads $slug with bounded scenario parameters and matching generated HIR",
    async (entry) => {
      const [example, runtime] = await Promise.all([
        loadExample(entry.slug),
        loadExampleRuntime(entry.slug),
      ]);

      expect(example.catalog).toBe(entry);

      for (const scenario of example.definition.scenarios ?? []) {
        expect(runtime.scenarioHirById).toHaveProperty(scenario.id);

        for (const parameter of scenario.scenarioParameters) {
          const bounds = entry.parameterBounds[parameter.identifier];
          expect(bounds, parameter.identifier).toBeDefined();
          expect(bounds!.min).toBeLessThanOrEqual(parameter.default);
          expect(bounds!.max).toBeGreaterThanOrEqual(parameter.default);
          expect(bounds!.step).toBeGreaterThan(0);
        }
      }
    },
  );

  it("caches one model/runtime load per example", async () => {
    const entry = exampleCatalog[0]!;
    const [firstExample, secondExample, firstRuntime, secondRuntime] =
      await Promise.all([
        loadExample(entry.slug),
        loadExample(entry.slug),
        loadExampleRuntime(entry.slug),
        loadExampleRuntime(entry.slug),
      ]);

    expect(secondExample).toBe(firstExample);
    expect(secondRuntime).toBe(firstRuntime);
  });
});
