import { describe, expect, it } from "vitest";

import { scanTags } from "./tags";

describe("scanTags", () => {
  it("reads a layer declaration from a file header", () => {
    const { tags, diagnostics } = scanTags(`/**
 * @layerRoot core.simulation.monte-carlo
 * @role Runs many bounded-memory simulations
 */
export const run = () => {};
`);

    expect(diagnostics).toEqual([]);
    expect(tags.layerRoot?.value).toBe("core.simulation.monte-carlo");
    expect(tags.layerRoot?.line).toBe(2);
    expect(tags.role?.value).toBe("Runs many bounded-memory simulations");
  });

  it("continues a tag's text across wrapped lines", () => {
    const { tags } = scanTags(`/**
 * @role Runs many bounded-memory simulations, so a long experiment
 *   never grows the heap regardless of how many frames it computes
 */`);

    expect(tags.role?.value).toBe(
      "Runs many bounded-memory simulations, so a long experiment never grows the heap regardless of how many frames it computes",
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
    const { tags, diagnostics } = scanTags(`/**
 * Does a thing.
 *
 * @param input the thing
 * @returns the other thing
 * @see somewhere
 */`);

    expect(diagnostics).toEqual([]);
    expect(tags.layerRoot).toBeNull();
    expect(tags.role).toBeNull();
  });

  it("ignores tags outside the vocabulary", () => {
    const { tags, diagnostics } = scanTags(`/**
 * @layerRoot core.lsp
 * @role Language-server client
 * @boundary thread — requests reach the server over a worker transport
 * @internal
 */`);

    expect(diagnostics).toEqual([]);
    expect(tags.layerRoot?.value).toBe("core.lsp");
    expect(tags.role?.value).toBe("Language-server client");
  });

  it("does not treat a tag mentioned mid-sentence as a tag", () => {
    const { tags, diagnostics } = scanTags(`/**
 * Layers are declared with @layerRoot on a folder entry file.
 */`);

    expect(tags.layerRoot).toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it("reports line numbers relative to the whole file", () => {
    const { tags } = scanTags(`line one
line two
line three

/**
 * @layerRoot core.thing
 */`);

    expect(tags.layerRoot?.line).toBe(6);
  });
});
