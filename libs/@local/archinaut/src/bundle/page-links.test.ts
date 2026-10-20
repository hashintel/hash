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

  it("turns a component import into an SVG import, climbing out of the folder", () => {
    const { contents } = resolveLocalDiagrams(
      'import Lanes from "../shared/lanes.d2";\n\n<Lanes />',
      slug,
      source,
      diagrams,
    );
    expect(contents).toBe(
      'import Lanes from "../../../../diagrams/layers/core/lanes.svg";\n\n<Lanes />',
    );
  });

  it("drops the image and stubs the component when nothing renders SVGs", () => {
    const { contents } = resolveLocalDiagrams(
      'import Flow from "./flow.d2";\n\n![x](./flow.d2)\n',
      slug,
      source,
      diagrams,
      false,
    );
    expect(contents).toBe("export const Flow = () => null;\n\n");
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
