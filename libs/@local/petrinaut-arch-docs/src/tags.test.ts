import { describe, expect, it } from "vitest";

import { scanTags } from "./tags";

describe("scanTags", () => {
  it("reads a layer declaration from a file header", () => {
    const { tags, diagnostics } = scanTags(`/**
 * @layerRoot core.simulation.monte-carlo
 * @layerName Monte Carlo runtime
 * @role Runs many bounded-memory simulations
 */
export const run = () => {};
`);

    expect(diagnostics).toEqual([]);
    expect(tags.layerRoot?.value).toBe("core.simulation.monte-carlo");
    expect(tags.layerRoot?.line).toBe(2);
    expect(tags.layerName?.value).toBe("Monte Carlo runtime");
    expect(tags.role?.value).toBe("Runs many bounded-memory simulations");
  });

  it("parses boundaries with any of the three separators", () => {
    const { tags, diagnostics } = scanTags(`/**
 * @boundary worker — frame buffers never leave the worker
 * @boundary thread - structured clone only
 * @boundary package: semver applies to this surface
 */`);

    expect(diagnostics).toEqual([]);
    expect(tags.boundaries).toEqual([
      {
        kind: "worker",
        note: "frame buffers never leave the worker",
        line: 2,
      },
      { kind: "thread", note: "structured clone only", line: 3 },
      { kind: "package", note: "semver applies to this surface", line: 4 },
    ]);
  });

  it("continues a tag's text across wrapped lines", () => {
    const { tags } = scanTags(`/**
 * @invariant Two reusable frame buffers per run, so a long experiment
 *   never grows the heap regardless of how many frames it computes
 */`);

    expect(tags.invariants).toHaveLength(1);
    expect(tags.invariants[0]?.value).toBe(
      "Two reusable frame buffers per run, so a long experiment never grows the heap regardless of how many frames it computes",
    );
  });

  it("ends a tag's text at a blank line", () => {
    const { tags } = scanTags(`/**
 * @role Compiles user code
 *
 * Extra prose that is not part of the role.
 */`);

    expect(tags.role?.value).toBe("Compiles user code");
  });

  it("collects tags from comments anywhere in the file, not just the header", () => {
    const { tags } = scanTags(`import { a } from "b";

/**
 * @boundary sandbox — user code runs with restricted globals
 */
export const evaluate = () => {};
`);

    expect(tags.boundaries).toEqual([
      {
        kind: "sandbox",
        note: "user code runs with restricted globals",
        line: 4,
      },
    ]);
  });

  it("rejects an unknown boundary kind", () => {
    const { tags, diagnostics } = scanTags(`/**
 * @boundary wormhole — not a real boundary
 */`);

    expect(tags.boundaries).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("unknown @boundary kind");
    expect(diagnostics[0]?.message).toContain("wormhole");
  });

  it("requires a note on a boundary", () => {
    const { diagnostics } = scanTags(`/**
 * @boundary worker
 */`);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("needs a note");
  });

  it("reports a duplicated singular tag rather than silently overwriting", () => {
    const { tags, diagnostics } = scanTags(`/**
 * @role First
 * @role Second
 */`);

    expect(tags.role?.value).toBe("First");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("duplicate @role");
  });

  it("suggests a correction for a miscased tag", () => {
    const { diagnostics } = scanTags(`/**
 * @LayerRoot core.thing
 */`);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toBe(
      "unknown tag @LayerRoot; did you mean @layerRoot?",
    );
  });

  it("ignores standard JSDoc tags", () => {
    const { diagnostics, annotated } = scanTags(`/**
 * Does a thing.
 *
 * @param input the thing
 * @returns the other thing
 * @see somewhere
 */`);

    expect(diagnostics).toEqual([]);
    expect(annotated).toBe(false);
  });

  it("does not treat a tag mentioned mid-sentence as a tag", () => {
    const { tags, diagnostics } = scanTags(`/**
 * Layers are declared with @layerRoot on a folder entry file.
 */`);

    expect(tags.layerRoot).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it("collects repeated seams", () => {
    const { tags } = scanTags(`/**
 * @seam @hashintel/petrinaut-core/workers/monte-carlo
 * @seam @hashintel/petrinaut-core/optimization
 */`);

    expect(tags.seams.map((seam) => seam.value)).toEqual([
      "@hashintel/petrinaut-core/workers/monte-carlo",
      "@hashintel/petrinaut-core/optimization",
    ]);
  });

  it("reports line numbers relative to the whole file", () => {
    const { tags } = scanTags(`line one
line two
line three

/**
 * @layer core.thing
 */`);

    expect(tags.layer?.line).toBe(6);
  });
});
