import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("reads a full layer declaration and keeps the prose body", () => {
    const { declaration, body, errors } = parseFrontmatter(`---
layer: core.simulation.monte-carlo
name: Monte Carlo runtime
role: Runs many bounded-memory simulations
entryPoints:
  - "@hashintel/petrinaut-core/workers/monte-carlo"
boundaries:
  - kind: worker
    note: Frame buffers never cross to the main thread
invariants:
  - Two reusable frame buffers per run
---

# Monte Carlo

Runs batches.
`);

    expect(errors).toEqual([]);
    expect(declaration).toEqual({
      layer: "core.simulation.monte-carlo",
      role: "Runs many bounded-memory simulations",
    });
    expect(body).toBe("# Monte Carlo\n\nRuns batches.");
  });

  it("ignores keys this version does not read, rather than rejecting them", () => {
    const { declaration, errors } = parseFrontmatter(`---
layer: core.simulation.monte-carlo
name: Monte Carlo runtime
role: Runs many simulations with bounded frame memory
entryPoints: ["@hashintel/petrinaut-core/workers/monte-carlo"]
boundaries:
  - kind: worker
    note: Frame buffers stay inside the worker
invariants: ["Two reusable frame buffers per run"]
---
`);

    expect(errors).toEqual([]);
    expect(declaration).toEqual({
      layer: "core.simulation.monte-carlo",
      role: "Runs many simulations with bounded frame memory",
    });
  });

  it("treats a README with no frontmatter as prose only", () => {
    const { declaration, body, errors } = parseFrontmatter(
      "# HIR\n\nThe compiler pipeline.\n",
    );

    expect(declaration).toBeNull();
    expect(errors).toEqual([]);
    expect(body).toBe("# HIR\n\nThe compiler pipeline.");
  });

  it("ignores frontmatter that is unrelated to architecture", () => {
    const { declaration, errors } = parseFrontmatter(`---
title: Some page
sidebar_position: 3
---
`);

    expect(declaration).toBeNull();
    expect(errors).toEqual([]);
  });

  it("flags a half-written declaration missing its layer key", () => {
    const { declaration, errors } = parseFrontmatter(`---
role: Does a thing
boundaries:
  - kind: worker
    note: something
---
`);

    expect(declaration).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("no `layer` key");
  });

  it("requires a role alongside a layer", () => {
    const { declaration, errors } = parseFrontmatter(`---
layer: core.thing
---
`);

    expect(declaration).toBeNull();
    expect(errors.join(" ")).toContain("role");
  });

  it("reports malformed YAML instead of throwing", () => {
    const { declaration, errors } = parseFrontmatter(`---
layer: [unclosed
---
`);

    expect(declaration).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("invalid YAML");
  });

  it("handles CRLF line endings", () => {
    const { declaration } = parseFrontmatter(
      "---\r\nlayer: core.thing\r\nrole: Does a thing\r\n---\r\nBody\r\n",
    );

    expect(declaration?.layer).toBe("core.thing");
  });
});
