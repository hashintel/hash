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
    renderVisualizerHir(lowered.view, tokens, parameters),
  );
};

describe("renderVisualizerHir", () => {
  it("fits the root viewBox without overriding nested SVG aspect ratios", () => {
    const lowered = lowerVisualizerToHir(
      `export default Visualization(() => <svg width={400} height={200} viewBox="0 0 400 200" style={{ width: "400px", height: "200px", borderRadius: "6px", backgroundColor: "#eff6ff" }} preserveAspectRatio="none"><svg width={100} height={50} preserveAspectRatio="xMinYMin meet" /></svg>);`,
      context,
    );
    if (!lowered.ok) throw new Error("The test visualizer must compile");
    expect(
      renderToStaticMarkup(
        renderVisualizerHir(lowered.view, [], {}, { fitViewport: true }),
      ),
    ).toBe(
      '<svg width="100%" height="100%" viewBox="0 0 400 200" style="background-color:#eff6ff" preserveAspectRatio="xMidYMid meet"><svg width="100" height="50" preserveAspectRatio="xMinYMin meet"></svg></svg>',
    );
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
    it.for(fixture)("$example / $place", ({ example, place, markup }) => {
      const sdcpn = examples.get(example)!;
      const placeDefinition = sdcpn.places.find(
        (candidate) => candidate.name === place,
      )!;
      const color = sdcpn.types.find(
        (type) => type.id === placeDefinition.colorId,
      )!;
      expect(
        render(
          placeDefinition.visualizerCode!,
          sampleTokens(color),
          buildVisualizerContext(sdcpn, placeDefinition),
          sampleParameters(sdcpn),
        ),
      ).toBe(markup);
    });
  });

  it("renders fragments, keys, booleans and nested arrays as React does", () => {
    expect(
      render(
        `return <svg><>
    {tokens.map((token, index) => <circle key={index} cx={token.x} />)}
    {false}
    {null}
    <text>{tokens.length}{" "}items</text>
  </></svg>;`,
        [{ x: 1 }, { x: 2 }],
      ),
    ).toBe(
      '<svg><circle cx="1"></circle><circle cx="2"></circle><text>2 items</text></svg>',
    );
  });

  it("refuses a remote url computed at run time", () => {
    expect(() =>
      render(
        `return <svg><rect fill={"url(https://x.test/?" + tokens.length + ")"} /></svg>;`,
      ),
    ).toThrow(/url\(#id\)/u);
  });

  it("leaves a null attribute unset", () => {
    expect(
      render(
        `return <svg><rect fill={tokens.length > 5 ? "red" : null} width={1} /></svg>;`,
      ),
    ).toBe('<svg><rect width="1"></rect></svg>');
  });
});
