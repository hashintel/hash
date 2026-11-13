import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_VISUALIZER_CODE,
  generateDefaultVisualizerCode,
} from "../default-codes";
import {
  deploymentPipelineSDCPN,
  probabilisticSatellitesSDCPN,
  supplyChainProfit,
  supplyChainWithDisruption,
  wheelTruing,
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
    width: 400,
    height: 240,
    parameters: parameters as Record<string, number | boolean>,
  });

const asElement = (value: ViewValue): ViewElementValue => {
  expect(value).toBeInstanceOf(ViewElementValue);
  return value as ViewElementValue;
};

describe("the view HIR", () => {
  it("keeps token fields out of the default template's grid coordinates", () => {
    const gridContext: HirVisualizerContext = {
      surface: "visualizer",
      parameters: [],
      elements: [{ name: "columns", type: "real" }],
    };
    const result = lowerVisualizerToHir(
      generateDefaultVisualizerCode({
        id: "grid",
        name: "Grid",
        iconSlug: "circle",
        displayColor: "#000000",
        elements: [{ elementId: "columns", name: "columns", type: "real" }],
      }),
      gridContext,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    const picture = asElement(
      interpretViewHir(result.view, {
        tokens: [{ columns: 0 }, { columns: 1 }],
        parameters: {},
        width: 400,
        height: 240,
      }),
    );
    const circles = picture.children.flat().map(asElement);
    expect(circles.map((circle) => circle.attributes.get("cx"))).toEqual([
      20, 60,
    ]);
    expect(circles.map((circle) => circle.attributes.get("cy"))).toEqual([
      20, 20,
    ]);
  });
  it("compiles both default templates as function bodies", () => {
    for (const code of [
      DEFAULT_VISUALIZER_CODE,
      generateDefaultVisualizerCode(
        probabilisticSatellitesSDCPN.petriNetDefinition.types[0]!,
      ),
    ]) {
      expect(code).not.toContain("export default");
      expect(asElement(draw(code, [])).tag).toBe("Visualizer.Svg");
    }
  });
  describe.each(
    [
      probabilisticSatellitesSDCPN,
      deploymentPipelineSDCPN,
      supplyChainWithDisruption,
      supplyChainProfit,
      wheelTruing,
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
  <Visualizer.Svg viewBox="0 0 10 10" backgroundColor="white">
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
  </Visualizer.Svg>
));`,
    );
    expect(view.props?.name).toBe("__props");
    expect(view.body.kind).toBe("element");
    if (view.body.kind !== "element") {
      return;
    }
    expect(view.body.tag).toBe("Visualizer.Svg");
    expect(view.body.attributes.map((attribute) => attribute.name)).toEqual([
      "viewBox",
      "backgroundColor",
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
    return <Visualizer.Svg />;
  }
  const { x } = first;
  return <Visualizer.Svg><circle cx={x} /></Visualizer.Svg>;
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
  <Visualizer.Svg>
    {tokens.map((token, index) => (
      <circle key={index} cx={token.x.toFixed(1)} r={parameters.radius} />
    ))}
    <text>{\`\${tokens.length} satellites\`}</text>
    {tokens.length > 1 && <rect width={tokens.slice(1).length} />}
    {tokens.filter((token) => token.x > 1).length === 0 ? <g /> : null}
  </Visualizer.Svg>
));`,
        [
          { x: 1.25, y: 2, id: 1n },
          { x: 3.5, y: 4, id: 2n },
        ],
      ),
    );
    expect(svg.tag).toBe("Visualizer.Svg");
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
  return <Visualizer.Svg>{first ? <circle cx={first.x} /> : null}{tokens.length && <g />}</Visualizer.Svg>;
});`,
        [],
      ),
    );
    expect(asElement(svg.children[0]!).attributes.get("cx")).toBe(0);
    // `0 && <g/>` is `0`, which React writes as text.
    expect(svg.children[1]).toBe(0);
  });

  it("lowers fragments inside an SVG", () => {
    const view = lowerOk(
      `return <Visualizer.Svg><><circle /><rect /></></Visualizer.Svg>;`,
    );
    const fragment = view.body.kind === "element" && view.body.children[0];
    expect(fragment && fragment.kind === "element" && fragment.tag).toBe(
      VIEW_FRAGMENT_TAG,
    );
  });

  it("joins text and numbers with `+`", () => {
    const text = asElement(
      draw(
        `export default Visualization(({ tokens, parameters }) => (
  <Visualizer.Svg><text>{parameters.label + ": " + tokens.length}</text></Visualizer.Svg>
));`,
        [{ x: 1, y: 1, id: 1n }],
      ),
    );
    expect(asElement(text.children[0]!).children).toEqual(["L: 1"]);
  });

  describe("what a visualizer cannot do", () => {
    describe.each(["body", "legacy"] as const)("%s syntax", (syntax) => {
      it.each([
        '(0, eval)("globalThis.__visualizerReviewCheck = 1"), 1',
        'eval("globalThis.__visualizerReviewCheck = 1")',
        'Function("globalThis.__visualizerReviewCheck = 1")()',
        '({}).constructor.constructor("globalThis.__visualizerReviewCheck = 1")()',
        "top.__visualizerReviewCheck = 1",
        "globalThis.__visualizerReviewCheck = 1",
      ])("rejects host execution: %s", (expression) => {
        vi.stubGlobal("__visualizerReviewCheck", 0);
        try {
          for (const root of ["Visualizer.Svg", "svg"]) {
            const body = `const value = (${expression}); return <${root}><text>{value}</text></${root}>;`;
            const code =
              syntax === "body"
                ? body
                : `export default Visualization(() => { ${body} });`;
            expect(
              lowerErr(code).some(
                (diagnostic) => diagnostic.severity === "error",
              ),
            ).toBe(true);
            expect(Reflect.get(globalThis, "__visualizerReviewCheck")).toBe(0);
          }
        } finally {
          vi.unstubAllGlobals();
        }
      });
    });

    it("interprets both syntaxes with string evaluation disabled", () => {
      const views = [
        "return <Visualizer.Svg><text>{tokens.length + 1}</text></Visualizer.Svg>;",
        "export default Visualization(({ tokens }) => <svg><text>{tokens.length + 1}</text></svg>);",
      ].map(lowerOk);
      const blocked = () => {
        throw new Error("String evaluation is disabled");
      };
      vi.stubGlobal("Function", blocked);
      vi.stubGlobal("eval", blocked);
      try {
        for (const view of views) {
          const picture = asElement(
            interpretViewHir(view, {
              tokens: [],
              parameters: {},
              width: 400,
              height: 240,
            }),
          );
          expect(asElement(picture.children[0]!).children).toEqual([1]);
        }
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("rejects type annotations and assertions", () => {
      expect(
        lowerErr(
          `export default Visualization(({ tokens }: { tokens: unknown[] }) => <Visualizer.Svg />);`,
        )[0],
      ).toMatchObject({ code: "hir:typescript-syntax" });
      expect(
        lowerErr(
          `export default Visualization(({ tokens }) => <Visualizer.Svg>{(tokens as unknown[]).length}</Visualizer.Svg>);`,
        )[0],
      ).toMatchObject({ code: "hir:typescript-syntax" });
      expect(
        lowerErr(
          `type Props = { tokens: unknown[] };\nexport default Visualization(() => <Visualizer.Svg />);`,
        )[0],
      ).toMatchObject({ code: "hir:typescript-syntax" });
    });

    it("rejects imports and hooks", () => {
      expect(
        lowerErr(
          `import { useState } from "react";\nexport default Visualization(() => <Visualizer.Svg />);`,
        )[0],
      ).toMatchObject({ code: "hir:unsupported-statement" });
      expect(
        lowerErr(
          `export default Visualization(() => {\n  const [n] = useState(0);\n  return <Visualizer.Svg>{n}</Visualizer.Svg>;\n});`,
        )[0],
      ).toMatchObject({ code: "hir:unsupported-call" });
    });

    it("rejects elements and attributes outside the allowlist", () => {
      const image = `export default Visualization(() => <Visualizer.Svg><image href="https://x.test/a.png" /></Visualizer.Svg>);`;
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
        `export default Visualization(() => <Visualizer.Svg onClick={() => 1} />);`,
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
          `export default Visualization(() => {\n  const dot = <circle />;\n  return <Visualizer.Svg>{dot}</Visualizer.Svg>;\n});`,
        )[0],
      ).toMatchObject({ code: "hir:unsupported-syntax" });
      expect(
        lowerErr(
          `export default Visualization(() => <Visualizer.Svg><rect fill={<g />} /></Visualizer.Svg>);`,
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
          `export default Visualization(() => <Visualizer.Svg><g style={{ background: "url(x)" }} /></Visualizer.Svg>);`,
        )[0],
      ).toMatchObject({ code: "hir:unsafe-value" });
      expect(
        lowerErr(
          `export default Visualization(() => <Visualizer.Svg><g style={{ behavior: "x" }} /></Visualizer.Svg>);`,
        )[0],
      ).toMatchObject({ code: "hir:unknown-style-property" });
      expect(
        lowerOk(
          `return <Visualizer.Svg><line markerEnd="url(#arrow)" /></Visualizer.Svg>;`,
        ).body.kind,
      ).toBe("element");
    });

    it("rejects literal values that load images through other CSS functions", () => {
      const imageSet = `export default Visualization(() => <svg style={{ background: 'image-set("https://x.invalid/a" 1x)' }} />);`;
      expect(lowerErr(imageSet)[0]).toMatchObject({
        code: "hir:unsafe-value",
        span: {
          start: imageSet.indexOf("'image-set"),
          length: `'image-set("https://x.invalid/a" 1x)'`.length,
        },
      });
      for (const value of [
        String.raw`"-webkit-image-set(url(https://x.invalid/a) 1x)"`,
        String.raw`"linear-gradient(red, blue), image-set('https://x.invalid/a' 1x)"`,
        // The JavaScript string holds `u\72l(...)`, which CSS reads as `url(...)`.
        String.raw`"u\\72l('https://x.invalid/a')"`,
      ]) {
        expect(
          lowerErr(
            `export default Visualization(() => <svg style={{ background: ${value} }} />);`,
          ).map((diagnostic) => diagnostic.code),
        ).toEqual(["hir:unsafe-value"]);
      }
    });

    it("accepts colours, gradients, transforms, fonts and any text child", () => {
      expect(
        lowerOk(
          `export default Visualization(() => (
  <svg
    style={{
      background: "linear-gradient(90deg, #fff, rgba(0, 0, 0, 0.5))",
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      transform: "translate(10px, 20px) rotate(45deg)",
    }}
  >
    <g transform="rotate(45 5 5)" fill="url(#gradient) red">
      <text>{"f(x) = url(https://x.invalid/a)"}</text>
    </g>
  </svg>
));`,
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
          `export default Visualization((tokens, parameters) => <Visualizer.Svg />);`,
        )[0],
      ).toMatchObject({ code: "hir:too-many-parameters" });
    });

    it("types attributes, children and the props", () => {
      expect(
        lowerErr(
          `export default Visualization(({ tokens }) => <Visualizer.Svg><rect width={tokens} /></Visualizer.Svg>);`,
        )[0],
      ).toMatchObject({ code: "hir:element-attribute-value" });
      expect(
        lowerErr(
          `export default Visualization(({ tokens }) => <Visualizer.Svg>{tokens[0]}</Visualizer.Svg>);`,
        )[0],
      ).toMatchObject({ code: "hir:element-child" });
      expect(
        lowerErr(
          `export default Visualization(({ tokens }) => <Visualizer.Svg>{tokens.map((token) => token.z)}</Visualizer.Svg>);`,
        )[0],
      ).toMatchObject({ code: "hir:unknown-field" });
    });
  });

  it.for([[], [{ x: 2, y: 3, id: 1n }]])(
    "draws the same picture from a body and a legacy module with tokens %s",
    (tokens) => {
      const body = `const first = tokens[0];
if (!first) return <Visualizer.Svg><text>Empty</text></Visualizer.Svg>;
return <Visualizer.Svg><circle cx={first.x} r={parameters.radius} /></Visualizer.Svg>;`;
      expect(draw(body, tokens)).toEqual(
        draw(
          `export default Visualization(({ tokens, parameters }) => {\n${body}\n});`,
          tokens,
        ),
      );
    },
  );

  it.each([
    "<g />",
    "<><Visualizer.Svg /></>",
    "null",
    "tokens.length && <Visualizer.Svg />",
    "tokens.length ? <Visualizer.Svg /> : null",
  ])("rejects a root other than a single SVG: %s", (root) => {
    expect(lowerErr(`return ${root};`)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "hir:visualizer-return" }),
      ]),
    );
  });

  it("reports errors at their positions in a bare body", () => {
    const code = `const first = tokens[0];\nreturn <Visualizer.Svg>{first.missing}</Visualizer.Svg>;`;
    expect(lowerErr(code)[0]).toMatchObject({
      code: "hir:unknown-field",
      span: { start: code.indexOf("missing"), length: 7 },
    });
  });

  it("does not mistake comments or JSX text for a module export", () => {
    const code = `// export default Visualization is optional\nreturn <Visualizer.Svg><text>export default Visualization</text></Visualizer.Svg>;`;
    expect(asElement(draw(code, [])).tag).toBe("Visualizer.Svg");
  });
});

describe("Visualizer.Svg", () => {
  it.each([
    "return <Visualizer.Svg><Visualizer.Svg /></Visualizer.Svg>;",
    "return <Visualizer.Scene />;",
    "return <Visualizer.Svg width={400} />;",
    'return <Visualizer.Svg style={{ backgroundColor: "white" }} />;',
    'return <Visualizer.Svg origin="bottom-left" />;',
    'return <Visualizer.Svg navigation="zoom" />;',
    'return <Visualizer.Svg viewBox="0 0 0 10" />;',
    'return <Visualizer.Svg viewBox="0 0 Infinity 10" />;',
    'return <Visualizer.Svg viewBox="0 0 20 10" origin="center" />;',
    "return <Visualizer.Svg backgroundColor={42} />;",
  ])("rejects an unsupported root contract: %s", (code) => {
    expect(lowerErr(code).length).toBeGreaterThan(0);
  });

  it("binds viewport dimensions in both code forms and allows local shadows", () => {
    const body =
      'return <Visualizer.Svg origin="center"><rect width={width} height={height} /></Visualizer.Svg>;';
    for (const code of [
      body,
      `export default Visualization(() => { ${body} });`,
      `export default Visualization((props) => { ${body} });`,
    ]) {
      const shape = asElement(asElement(draw(code, [])).children[0]!);
      expect(shape.attributes.get("width")).toBe(400);
      expect(shape.attributes.get("height")).toBe(240);
    }
    const shape = asElement(
      asElement(draw(`const width = 80; ${body}`, [])).children[0]!,
    );
    expect(shape.attributes.get("width")).toBe(80);
  });
});
