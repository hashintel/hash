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

describe("scanTags for Python", () => {
  it("reads a layer declaration from a module docstring", () => {
    const { tags, diagnostics } = scanTags(
      `"""HTTP API for optimization studies.

@layerRoot optimizer
@role Runs detached Optuna studies against the CLI.
"""

import asyncio
`,
      "python",
    );

    expect(diagnostics).toEqual([]);
    expect(tags.layerRoot?.value).toBe("optimizer");
    expect(tags.layerRoot?.line).toBe(3);
    expect(tags.role?.value).toBe(
      "Runs detached Optuna studies against the CLI.",
    );
  });

  it("reads tags from single-quoted docstrings too", () => {
    const { tags } = scanTags(
      `'''
@layerRoot bindings
@role Sessions owning one CLI process each.
'''
`,
      "python",
    );

    expect(tags.layerRoot?.value).toBe("bindings");
  });

  it("reads tags from a prefixed (raw) docstring", () => {
    const { tags } = scanTags(
      `r"""Escapes like \\d survive in raw docstrings.

@layerRoot bindings
@role Sessions owning one CLI process each.
"""
`,
      "python",
    );

    expect(tags.layerRoot?.value).toBe("bindings");
  });

  it("ignores triple-quoted strings that are not the module docstring", () => {
    const { tags } = scanTags(
      `import textwrap

QUERY = """
@layerRoot not-a-layer
"""


def helper():
    """@layerRoot also-not-a-layer"""
`,
      "python",
    );

    expect(tags.layerRoot).toBeNull();
  });

  it("reads the module docstring after leading comments and blank lines", () => {
    const { tags } = scanTags(
      `#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
@layerRoot optimizer
@role One line.
"""
`,
      "python",
    );

    expect(tags.layerRoot?.value).toBe("optimizer");
  });

  it("does not read JSDoc-style comments as Python docstrings", () => {
    const { tags } = scanTags(
      `# @layerRoot commented-out
value = "/** @layerRoot not-a-docstring */"
`,
      "python",
    );

    expect(tags.layerRoot).toBeNull();
  });

  it("keeps duplicate detection and miscasing hints for Python", () => {
    const { diagnostics } = scanTags(
      `"""
@layerroot optimizer
@role One role.
@role Another role.
"""
`,
      "python",
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        message: "unknown tag @layerroot; did you mean @layerRoot?",
      }),
      expect.objectContaining({
        message: expect.stringContaining("duplicate @role"),
      }),
    ]);
  });
});
