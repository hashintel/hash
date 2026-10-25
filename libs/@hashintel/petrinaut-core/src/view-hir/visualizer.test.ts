import { describe, expect, it } from "vitest";

import {
  deploymentPipelineSDCPN,
  probabilisticSatellitesSDCPN,
  supplyChainProfit,
  supplyChainWithDisruption,
} from "../examples";
import { buildVisualizerContext } from "../hir/surface-context";
import { interpretViewHir, ViewElementValue } from "./interpret-view";
import { VIEW_FRAGMENT_TAG } from "./view-hir";
import { viewHirSchema } from "./view-hir-schema";
import { lowerVisualizerToHir } from "./visualizer";

import type { HirVisualizerContext } from "../hir/surface-context";
import type { ViewValue } from "./interpret-view";

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
  return result.view;
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
): ViewValue =>
  interpretViewHir(lowerOk(code), {
    tokens,
    parameters: parameters as Record<string, number | boolean>,
  });

const asElement = (value: ViewValue): ViewElementValue => {
  expect(value).toBeInstanceOf(ViewElementValue);
  return value as ViewElementValue;
};

describe("the view HIR", () => {
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
      "lowers, checks and serializes the visualizer of $name",
      (place) => {
        const result = lowerVisualizerToHir(
          place.visualizerCode!,
          buildVisualizerContext(sdcpn, place),
        );
        expect(
          result.ok ? [] : result.diagnostics.map((item) => item.message),
        ).toEqual([]);
        if (result.ok) {
          expect(
            viewHirSchema.parse(JSON.parse(JSON.stringify(result.view))),
          ).toEqual(result.view);
        }
      },
    );
  });

  it("lowers elements, attributes, keys, text and children", () => {
    const view = lowerOk(
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
    expect(view.props?.name).toBe("__props");
    expect(view.body.kind).toBe("element");
    if (view.body.kind !== "element") {
      return;
    }
    expect(view.body.tag).toBe("svg");
    expect(view.body.attributes.map((attribute) => attribute.name)).toEqual([
      "viewBox",
      "style",
    ]);
    // The comment child lowers to nothing; whitespace-only text is dropped.
    expect(view.body.children.map((child) => child.kind)).toEqual([
      "element",
      "map",
      "element",
    ]);
    const text = view.body.children[2]!;
    expect(
      text.kind === "element" && text.children.map((child) => child.kind),
    ).toEqual(["expr", "text"]);
    const map = view.body.children[1]!;
    expect(map.kind === "map" && map.body.kind).toBe("element");
  });

  it("lowers block bodies to bindings and guards to conditionals", () => {
    const view = lowerOk(
      `export default Visualization(({ tokens }) => {
  const first = tokens[0];
  if (!first) {
    return <svg />;
  }
  const { x } = first;
  return <svg><circle cx={x} /></svg>;
});`,
    );
    expect(view.body.kind).toBe("let");
    if (view.body.kind !== "let") {
      return;
    }
    expect(view.body.bindings.map((binding) => binding.name)).toEqual([
      "first",
    ]);
    expect(view.body.body.kind).toBe("cond");
  });

  it("interprets a picture into element values", () => {
    const svg = asElement(
      draw(
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
      ),
    );
    expect(svg.tag).toBe("svg");
    const [circles, text, rect, nothing] = svg.children;
    expect(Array.isArray(circles) && circles.length).toBe(2);
    const first = asElement((circles as ViewValue[])[0]!);
    expect(first.key).toBe(0);
    expect(first.attributes.get("cx")).toBe("1.3");
    expect(first.attributes.get("r")).toBe(4);
    expect(asElement(text!).children).toEqual(["2 satellites"]);
    expect(asElement(rect!).attributes.get("width")).toBe(1);
    expect(nothing).toBeNull();
  });

  it("keeps JavaScript's value semantics for `||`, `&&` and an empty place", () => {
    const svg = asElement(
      draw(
        `export default Visualization(({ tokens }) => {
  const first = tokens[0] || { x: 0, y: 0 };
  return <svg>{first ? <circle cx={first.x} /> : null}{tokens.length && <g />}</svg>;
});`,
        [],
      ),
    );
    expect(asElement(svg.children[0]!).attributes.get("cx")).toBe(0);
    // `0 && <g/>` is `0`, which React writes as text.
    expect(svg.children[1]).toBe(0);
  });

  it("lowers fragments", () => {
    const view = lowerOk(
      `export default Visualization(() => <><circle /><rect /></>);`,
    );
    expect(view.props).toBeNull();
    expect(view.body.kind === "element" && view.body.tag).toBe(
      VIEW_FRAGMENT_TAG,
    );
  });

  it("joins text and numbers with `+`", () => {
    const text = asElement(
      draw(
        `export default Visualization(({ tokens, parameters }) => (
  <text>{parameters.label + ": " + tokens.length}</text>
));`,
        [{ x: 1, y: 1, id: 1n }],
      ),
    );
    expect(text.children).toEqual(["L: 1"]);
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
      const image = `export default Visualization(() => <svg><image href="https://x.test/a.png" /></svg>);`;
      expect(lowerErr(image)[0]).toMatchObject({
        code: "hir:unknown-element",
        span: { start: image.indexOf("image"), length: "image".length },
      });
      expect(
        lowerErr(`export default Visualization(() => <rect href="#a" />);`)[0],
      ).toMatchObject({ code: "hir:unknown-element-attribute" });
      // The name is judged before the value, so a handler is named as such
      // rather than failing on its arrow function.
      const [handler] = lowerErr(
        `export default Visualization(() => <svg onClick={() => 1} />);`,
      );
      expect(handler).toMatchObject({ code: "hir:unknown-element-attribute" });
      expect(handler?.message).toContain("event handler");
      expect(
        lowerErr(`export default Visualization(() => <Foo />);`)[0],
      ).toMatchObject({ code: "hir:unknown-element" });
    });

    it("rejects elements used as values", () => {
      expect(
        lowerErr(
          `export default Visualization(() => {\n  const dot = <circle />;\n  return <svg>{dot}</svg>;\n});`,
        )[0],
      ).toMatchObject({ code: "hir:unsupported-syntax" });
      expect(
        lowerErr(
          `export default Visualization(() => <svg fill={<g />} />);`,
        )[0],
      ).toMatchObject({ code: "hir:element-attribute-value" });
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
          `export default Visualization(({ tokens }) => tokens.map((token) => <circle cx={token.x} />));`,
        )[0],
      ).toMatchObject({ code: "hir:visualizer-return" });
      expect(
        lowerErr(
          `export default Visualization((tokens, parameters) => <svg />);`,
        )[0],
      ).toMatchObject({ code: "hir:too-many-parameters" });
    });

    it("types attributes, children and the props", () => {
      expect(
        lowerErr(
          `export default Visualization(({ tokens }) => <svg><rect width={tokens} /></svg>);`,
        )[0],
      ).toMatchObject({ code: "hir:element-attribute-value" });
      expect(
        lowerErr(
          `export default Visualization(({ tokens }) => <svg>{tokens[0]}</svg>);`,
        )[0],
      ).toMatchObject({ code: "hir:element-child" });
      expect(
        lowerErr(
          `export default Visualization(({ tokens }) => <svg>{tokens.map((token) => token.z)}</svg>);`,
        )[0],
      ).toMatchObject({ code: "hir:unknown-field" });
    });
  });

  it("is a module, not a bare body", () => {
    expect(lowerErr(`return <svg />;`)[0]).toMatchObject({
      code: "hir:unsupported-statement",
    });
  });
});
