import { describe, expect, it } from "vitest";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";

import { normalizeExampleDefinition } from "./normalize-example";

import type { SDCPN } from "@hashintel/petrinaut-core";

const loadModel = async (slug: string): Promise<SDCPN> => {
  const module = (await import(`./models/${slug}.json`)) as {
    default: unknown;
  };
  const parsed = parseSDCPNFile(module.default);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const { title: _title, ...definition } = parsed.sdcpn;
  return definition;
};

describe("normalizeExampleDefinition", () => {
  it("rewrites the truck-fleet scenario initial states", async () => {
    const slug = "truck-fleet-predictive-maintenance";
    const definition = await loadModel(slug);
    const normalized = normalizeExampleDefinition(slug, definition);

    const codeScenarios = (normalized.scenarios ?? []).filter(
      (scenario) => scenario.initialState.type === "code",
    );
    expect(codeScenarios.length).toBeGreaterThan(0);

    // The content sniffing must actually have fired for the real model: the
    // imperative loop is gone and the range() rewrite is in its place. If the
    // source model changes shape, this fails here instead of as an opaque
    // scenario-compilation error in the artifact-generation script.
    for (const scenario of codeScenarios) {
      const content =
        scenario.initialState.type === "code"
          ? scenario.initialState.content
          : "";
      expect(content).not.toContain("for (let index = 0;");
      expect(content).toContain("range(scenario.trucks)");
      expect(content).toMatch(/(scenario|parameters)\.base_severity_mean/);
    }
  });

  it("initialises every attribute of the types it rewrites", async () => {
    // The rewrite hardcodes the attributes of `Truck` and `Conditions`. A field
    // added to either type would otherwise fall back to the type default and
    // simulate silently wrong, because the sniff still fires and the generator
    // stays green.
    const slug = "truck-fleet-predictive-maintenance";
    const definition = await loadModel(slug);
    const normalized = normalizeExampleDefinition(slug, definition);

    const rewritten = (normalized.scenarios ?? [])
      .map((scenario) =>
        scenario.initialState.type === "code"
          ? scenario.initialState.content
          : "",
      )
      .join("\n");

    for (const typeName of ["Truck", "Conditions"]) {
      const colourType = definition.types.find(
        (candidate) => candidate.name === typeName,
      );
      expect(colourType, `${typeName} is missing from the model`).toBeDefined();
      for (const element of colourType?.elements ?? []) {
        // Anchored on a word boundary so `clock:` is not satisfied by
        // `conditions_clock:`.
        expect(
          rewritten,
          `${typeName}.${element.name} is not initialised by the rewrite`,
        ).toMatch(new RegExp(`\\b${element.name}:`, "u"));
      }
    }
  });

  it("passes other examples through unchanged", async () => {
    const slug = "gases-1-pn";
    const definition = await loadModel(slug);
    expect(normalizeExampleDefinition(slug, definition)).toBe(definition);
  });
});
