import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildVisualizerContext } from "@hashintel/petrinaut-core";
import {
  deploymentPipelineSDCPN,
  probabilisticSatellitesSDCPN,
  supplyChainProfit,
  supplyChainWithDisruption,
} from "@hashintel/petrinaut-core/examples";
import { lowerVisualizerToHir } from "@hashintel/petrinaut-core/view-hir";

import { renderVisualizerHir } from "./render-visualizer-hir";
import { sampleParameters, sampleTokens } from "./visualizer-parity-fixture";
import fixture from "./visualizer-parity.fixture.json";

import type { HirVisualizerContext, SDCPN } from "@hashintel/petrinaut-core";

const context: HirVisualizerContext = {
  surface: "visualizer",
  parameters: [],
  elements: [{ name: "x", type: "real" }],
};

const render = (
  code: string,
  tokens: Record<string, number | boolean | bigint | string>[] = [{ x: 1 }],
  lowerContext = context,
  parameters: Record<string, number | boolean> = {},
) => {
  const lowered = lowerVisualizerToHir(code, lowerContext);
  if (!lowered.ok) {
    throw new Error(lowered.diagnostics.map((item) => item.message).join("; "));
  }
  return renderToStaticMarkup(
    renderVisualizerHir(lowered.view, tokens, parameters, {
      width: 400,
      height: 240,
    }),
  );
};

describe("renderVisualizerHir", () => {
  it("owns SVG dimensions, preserves proportions, and fills the window background", () => {
    const markup = render(
      'return <Visualizer.Svg viewBox="0 0 400 200" backgroundColor="#eff6ff"><circle r={10} /></Visualizer.Svg>;',
    );
    expect(markup).toContain(
      'width="100%" height="100%" viewBox="0 -20 400 240" preserveAspectRatio="xMidYMid meet"',
    );
    expect(markup).toContain("background-color:#eff6ff");
  });
  describe("draws every example visualizer", () => {
    const examples = new Map<string, SDCPN>(
      [
        probabilisticSatellitesSDCPN,
        deploymentPipelineSDCPN,
        supplyChainWithDisruption,
        supplyChainProfit,
      ].map((example) => [example.title, example.petriNetDefinition]),
    );
    it.for(fixture)(
      "$example / $place",
      ({ example, place, markup: previousMarkup }) => {
        const sdcpn = examples.get(example)!;
        const placeDefinition = sdcpn.places.find(
          (candidate) => candidate.name === place,
        )!;
        const color = sdcpn.types.find(
          (type) => type.id === placeDefinition.colorId,
        )!;
        const markup = render(
          placeDefinition.visualizerCode!,
          sampleTokens(color),
          buildVisualizerContext(sdcpn, placeDefinition),
          sampleParameters(sdcpn),
        );
        expect(markup).toContain("<svg");
        expect(markup).not.toContain("NaN");
        if (example === deploymentPipelineSDCPN.title) {
          const drawing = (value: string) =>
            value.match(/<svg[^>]*>([\s\S]*?)<\/svg>/u)?.[1];
          expect(drawing(markup)).toBe(drawing(previousMarkup));
        }
      },
    );
  });

  it("renders fragments, keys, booleans and nested arrays as React does", () => {
    expect(
      render(
        `return <Visualizer.Svg><>
    {tokens.map((token, index) => <circle key={index} cx={token.x} />)}
    {false}
    {null}
    <text>{tokens.length}{" "}items</text>
  </></Visualizer.Svg>;`,
        [{ x: 1 }, { x: 2 }],
      ),
    ).toContain(
      '<circle cx="1"></circle><circle cx="2"></circle><text>2 items</text>',
    );
  });

  it("refuses a remote url computed at run time", () => {
    expect(() =>
      render(
        `return <Visualizer.Svg><rect fill={"url(https://x.test/?" + tokens.length + ")"} /></Visualizer.Svg>;`,
      ),
    ).toThrow(/url\(#id\)/u);
  });

  it.each([
    'backgroundColor={"url(https://x.test/?" + tokens.length + ")"}',
    'viewBox={"0 0 " + (tokens.length - 1) + " 20"}',
    'navigation={tokens.length > 5 ? "pan-zoom" : "invalid"}',
  ])("validates computed root properties: %s", (attribute) => {
    expect(() => render(`return <Visualizer.Svg ${attribute} />;`)).toThrow();
  });

  it.each(["svg", "Visualizer.Svg"])(
    "refuses a forged nested %s even when compilation was bypassed",
    (tag) => {
      const lowered = lowerVisualizerToHir(
        "return <Visualizer.Svg><circle /></Visualizer.Svg>;",
        context,
      );
      if (!lowered.ok || lowered.view.body.kind !== "element")
        throw new Error("Expected a lowered root");
      const child = lowered.view.body.children[0];
      if (child?.kind !== "element")
        throw new Error("Expected an element child");
      const view = {
        ...lowered.view,
        body: { ...lowered.view.body, children: [{ ...child, tag }] },
      };
      expect(() =>
        renderVisualizerHir(view, [], {}, { width: 400, height: 200 }),
      ).toThrow(/cannot be drawn/u);
    },
  );

  it("leaves a null attribute unset", () => {
    expect(
      render(
        `return <Visualizer.Svg><rect fill={tokens.length > 5 ? "red" : null} width={1} /></Visualizer.Svg>;`,
      ),
    ).toContain('<rect width="1"></rect>');
  });
});
