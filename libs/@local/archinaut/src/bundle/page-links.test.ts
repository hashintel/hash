import { describe, expect, it } from "vitest";

import { resolveLocalDiagrams } from "./page-links";

const diagrams = new Map([
  ["libs/core/src/handle/flow.d2", "layers/core.handle/flow"],
  ["libs/core/src/shared/lanes.d2", "layers/core/lanes"],
]);
const slug = "architecture/core/handle/host-integration";
const source = "libs/core/src/handle/host-integration.mdx";

describe("resolveLocalDiagrams", () => {
  it("turns a relative image reference into the rendered SVG beside the pages", () => {
    const { contents, unresolved } = resolveLocalDiagrams(
      "Before.\n\n![The flow](./flow.d2)\n\nAfter.",
      slug,
      source,
      diagrams,
    );
    expect(contents).toBe(
      "Before.\n\n![The flow](../../../../diagrams/layers/core.handle/flow.svg)\n\nAfter.",
    );
    expect(unresolved).toEqual([]);
  });

  it("climbs out of the folder to a diagram beside a sibling page", () => {
    const { contents } = resolveLocalDiagrams(
      "![Lanes](../shared/lanes.d2)",
      slug,
      source,
      diagrams,
    );
    expect(contents).toBe(
      "![Lanes](../../../../diagrams/layers/core/lanes.svg)",
    );
  });

  it("drops the image when nothing renders SVGs", () => {
    const { contents } = resolveLocalDiagrams(
      "Before.\n\n![x](./flow.d2)\nAfter.",
      slug,
      source,
      diagrams,
      false,
    );
    expect(contents).toBe("Before.\n\nAfter.");
  });

  it("reports a reference to a diagram the scan did not find", () => {
    const { contents, unresolved } = resolveLocalDiagrams(
      "![x](./missing.d2)",
      slug,
      source,
      diagrams,
    );
    expect(contents).toBe("![x](./missing.d2)");
    expect(unresolved).toEqual(["./missing.d2"]);
  });

  it("leaves an example inside a code fence as written", () => {
    const text = "```md\n![x](./flow.d2)\n```";
    expect(resolveLocalDiagrams(text, slug, source, diagrams).contents).toBe(
      text,
    );
  });
});
