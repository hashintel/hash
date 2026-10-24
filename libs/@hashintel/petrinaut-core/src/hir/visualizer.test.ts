import { describe, expect, it } from "vitest";

import {
  deploymentPipelineSDCPN,
  probabilisticSatellitesSDCPN,
  supplyChainProfit,
  supplyChainWithDisruption,
} from "../examples";
import { HIR_FRAGMENT_TAG } from "./hir";
import { HirElementValue, interpretHir } from "./interpret";
import { lowerTypeScriptToHir } from "./lower-typescript";
import { buildVisualizerContext } from "./surface-context";
import { lowerVisualizerToHir } from "./visualizer";

import type { HirVisualizerContext } from "./surface-context";

const context: HirVisualizerContext = {
  surface: "visualizer",
  parameters: [
    { name: "radius", type: "real" },
    { name: "label", type: "string" },
  ],
  elements: [
    { name: "x", type: "real" },
    { name: "y", type: "real" },
    { name: "id", type: "uuid" },
  ],
};

const lowerOk = (code: string) => {
  const result = lowerVisualizerToHir(code, context);
  if (!result.ok) {
    throw new Error(
      result.diagnostics.map((diagnostic) => diagnostic.message).join("; "),
    );
  }
  return result.fn;
};

const lowerErr = (code: string) => {
  const result = lowerVisualizerToHir(code, context);
  if (result.ok) {
    throw new Error("Expected lowering to fail");
  }
  return result.diagnostics;
};

const draw = (
  code: string,
  tokens: Record<string, number | bigint>[],
  parameters: Record<string, number | string> = { radius: 4, label: "L" },
) =>
  interpretHir(lowerOk(code), { parameters: {}, scenario: {} }, [
    { tokens, parameters },
  ]);

describe("the visualizer surface", () => {
  describe.each(
    [
      probabilisticSatellitesSDCPN,
      deploymentPipelineSDCPN,
      supplyChainWithDisruption,
      supplyChainProfit,
    ].filter((example) =>
      example.petriNetDefinition.places.some((place) => place.visualizerCode),
    ),
  )("$title", (example) => {
    const sdcpn = example.petriNetDefinition;
    it.for(sdcpn.places.filter((place) => place.visualizerCode))(
      "lowers and checks the visualizer of $name",
      (place) => {
        const result = lowerVisualizerToHir(
          place.visualizerCode!,
          buildVisualizerContext(sdcpn, place),
        );
        expect(
          result.ok ? [] : result.diagnostics.map((item) => item.message),
        ).toEqual([]);
      },
    );
  });

  it("lowers elements, attributes, keys, text and children", () => {
    const fn = lowerOk(
      `export default Visualization(({ tokens, parameters }) => (
  <svg viewBox="0 0 10 10" style={{ width: "100%" }}>
    {/* planet */}
    <circle cx={5} cy={5} r={parameters.radius} fill="#2196f3" />
    {tokens.map((token) => (
      <g key={token.id}>
        <circle cx={token.x} cy={token.y} r={1} />
      </g>
    ))}
    <text x="1" y="9">
      {tokens.length} tokens
    </text>
  </svg>
));`,
    );
    expect(fn.surface).toBe("visualizer");
    expect(fn.body.kind).toBe("element");
    if (fn.body.kind !== "element") {
      return;
    }
    expect(fn.body.tag).toBe("svg");
    expect(fn.body.attributes.map((attribute) => attribute.name)).toEqual([
      "viewBox",
      "style",
    ]);
    // The comment child lowers to nothing; whitespace-only text is dropped.
    expect(fn.body.children.map((child) => child.kind)).toEqual([
      "element",
      "arrayMap",
      "element",
    ]);
    const text = fn.body.children[2]!;
    expect(text.kind === "element" && text.children.map((c) => c.kind)).toEqual(
      ["length", "stringLit"],
    );
  });

  it("interprets a picture into element values", () => {
    const picture = draw(
      `export default Visualization(({ tokens, parameters }) => (
  <svg>
    {tokens.map((token, index) => (
      <circle key={index} cx={token.x.toFixed(1)} r={parameters.radius} />
    ))}
    <text>{\`\${tokens.length} satellites\`}</text>
    {tokens.length > 1 && <rect width={tokens.slice(1).length} />}
    {tokens.filter((token) => token.x > 1).length === 0 ? <g /> : null}
  </svg>
));`,
      [
        { x: 1.25, y: 2, id: 1n },
        { x: 3.5, y: 4, id: 2n },
      ],
    );
    expect(picture).toBeInstanceOf(HirElementValue);
    const svg = picture as HirElementValue;
    expect(svg.tag).toBe("svg");
    const [circles, text, rect, nothing] = svg.children;
    expect(Array.isArray(circles) && circles.length).toBe(2);
    const first = (circles as HirElementValue[])[0]!;
    expect(first.key).toBe(0);
    expect(first.attributes.get("cx")).toBe("1.3");
    expect(first.attributes.get("r")).toBe(4);
    expect((text as HirElementValue).children).toEqual(["2 satellites"]);
    expect((rect as HirElementValue).attributes.get("width")).toBe(1);
    expect(nothing).toBeNull();
  });

  it("keeps JavaScript's value semantics for `||` and an empty place", () => {
    const picture = draw(
      `export default Visualization(({ tokens }) => {
  const first = tokens[0] || { x: 0, y: 0 };
  return <svg>{first ? <circle cx={first.x} /> : null}</svg>;
});`,
      [],
    ) as HirElementValue;
    expect((picture.children[0] as HirElementValue).attributes.get("cx")).toBe(
      0,
    );
  });

  it("lowers fragments", () => {
    const fn = lowerOk(
      `export default Visualization(() => <><circle /><rect /></>);`,
    );
    expect(fn.body.kind === "element" && fn.body.tag).toBe(HIR_FRAGMENT_TAG);
  });

  it("joins text and numbers with `+`", () => {
    const picture = draw(
      `export default Visualization(({ tokens, parameters }) => (
  <text>{parameters.label + ": " + tokens.length}</text>
));`,
      [{ x: 1, y: 1, id: 1n }],
    ) as HirElementValue;
    expect(picture.children).toEqual(["L: 1"]);
  });

  describe("what a visualizer cannot do", () => {
    it("rejects type annotations and assertions", () => {
      expect(
        lowerErr(
          `export default Visualization(({ tokens }: { tokens: unknown[] }) => <svg />);`,
        )[0],
      ).toMatchObject({ code: "hir:typescript-syntax" });
      expect(
        lowerErr(
          `export default Visualization(({ tokens }) => <svg>{(tokens as unknown[]).length}</svg>);`,
        )[0],
      ).toMatchObject({ code: "hir:typescript-syntax" });
      expect(
        lowerErr(
          `type Props = { tokens: unknown[] };\nexport default Visualization(() => <svg />);`,
        )[0],
      ).toMatchObject({ code: "hir:typescript-syntax" });
    });

    it("rejects imports and hooks", () => {
      expect(
        lowerErr(
          `import { useState } from "react";\nexport default Visualization(() => <svg />);`,
        )[0],
      ).toMatchObject({ code: "hir:unsupported-statement" });
      expect(
        lowerErr(
          `export default Visualization(() => {\n  const [n] = useState(0);\n  return <svg>{n}</svg>;\n});`,
        )[0],
      ).toMatchObject({ code: "hir:unsupported-call" });
    });

    it("rejects elements and attributes outside the allowlist", () => {
      expect(
        lowerErr(
          `export default Visualization(() => <svg><image href="https://x.test/a.png" /></svg>);`,
        ).map((diagnostic) => diagnostic.code),
      ).toEqual(["hir:unknown-element", "hir:unknown-element-attribute"]);
      expect(
        lowerErr(`export default Visualization(() => <svg onClick={1} />);`)[0],
      ).toMatchObject({ code: "hir:unknown-element-attribute" });
      expect(
        lowerErr(`export default Visualization(() => <Foo />);`)[0],
      ).toMatchObject({ code: "hir:unknown-element" });
    });

    it("rejects remote urls in literal values and unknown style properties", () => {
      expect(
        lowerErr(
          `export default Visualization(() => <rect fill="url(https://x.test/p)" />);`,
        )[0],
      ).toMatchObject({ code: "hir:unsafe-value" });
      expect(
        lowerErr(
          `export default Visualization(() => <svg style={{ background: "url(x)" }} />);`,
        )[0],
      ).toMatchObject({ code: "hir:unsafe-value" });
      expect(
        lowerErr(
          `export default Visualization(() => <svg style={{ behavior: "x" }} />);`,
        )[0],
      ).toMatchObject({ code: "hir:unknown-style-property" });
      expect(
        lowerOk(
          `export default Visualization(() => <line markerEnd="url(#arrow)" />);`,
        ).body.kind,
      ).toBe("element");
    });

    it("requires an element result and a single props argument", () => {
      expect(
        lowerErr(`export default Visualization(() => 42);`)[0],
      ).toMatchObject({ code: "hir:visualizer-return" });
      expect(
        lowerErr(
          `export default Visualization((tokens, parameters) => <svg />);`,
        )[0],
      ).toMatchObject({ code: "hir:too-many-parameters" });
    });
  });

  it("is not a bare-body surface", () => {
    const result = lowerTypeScriptToHir(`return <svg />;`, "visualizer");
    expect(result.ok).toBe(false);
  });
});
