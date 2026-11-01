import { describe, expect, it } from "vitest";

import { parseFrontmatter, parseFrontmatterRecord } from "./frontmatter";

describe("parseFrontmatterRecord", () => {
  /**
   * Both readers go through this, so the cases below are the ones that used to
   * differ between the YAML parse and a line-splitting one.
   */
  it("strips a trailing comment from a value", () => {
    const { record } = parseFrontmatterRecord(`---
attachTo: core.simulation # a layer declared in the source
---
`);

    expect(record?.attachTo).toBe("core.simulation");
  });

  it("keeps a hash inside a quoted value", () => {
    const { record } = parseFrontmatterRecord(`---
title: "Frame #3"
---
`);

    expect(record?.title).toBe("Frame #3");
  });

  it("reports a `layer` key even beside unrelated page keys", () => {
    const { record } = parseFrontmatterRecord(`---
title: A guide
layer: core.sneaky
role: should be rejected
---
`);

    expect(record).not.toBeNull();
    expect("layer" in (record ?? {})).toBe(true);
  });

  it("preserves the type YAML inferred", () => {
    const { record } = parseFrontmatterRecord(`---
sidebar_order: 10
---
`);

    expect(record?.sidebar_order).toBe(10);
  });

  it("treats a non-mapping document as absent", () => {
    expect(
      parseFrontmatterRecord("---\n- one\n- two\n---\n").record,
    ).toBeNull();
  });

  it("reports unreadable YAML", () => {
    const { record, errors } = parseFrontmatterRecord(
      "---\nlayer: [unclosed\n---\n",
    );

    expect(record).toBeNull();
    expect(errors[0]).toContain("invalid YAML");
  });
});

describe("parseFrontmatter", () => {
  it("reads a layer declaration and keeps the prose body", () => {
    const { declaration, body, errors } = parseFrontmatter(`---
layer: core.simulation.monte-carlo
role: Runs many bounded-memory simulations
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

  it("rejects an unknown key on a declaration, catching typos", () => {
    const { declaration, errors } = parseFrontmatter(`---
layer: core.thing
role: Does a thing
rol: Does a thing
---
`);

    expect(declaration).toBeNull();
    expect(errors).toHaveLength(1);
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
