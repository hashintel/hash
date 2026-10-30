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
  /**
   * The markup the Babel-compiled components produced for the same frame,
   * recorded before that compiler was removed. Every shipped visualizer must
   * draw the same picture through the HIR.
   */
  describe("draws every example visualizer as the compiled component did", () => {
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
        `export default Visualization(({ tokens }) => (
  <>
    {tokens.map((token, index) => <circle key={index} cx={token.x} />)}
    {false}
    {null}
    <text>{tokens.length}{" "}items</text>
  </>
));`,
        [{ x: 1 }, { x: 2 }],
      ),
    ).toBe(
      '<circle cx="1"></circle><circle cx="2"></circle><text>2 items</text>',
    );
  });

  it("refuses a remote url computed at run time", () => {
    expect(() =>
      render(
        `export default Visualization(({ tokens }) => (
  <rect fill={"url(https://x.test/?" + tokens.length + ")"} />
));`,
      ),
    ).toThrow(/url\(#id\)/u);
  });

  it("leaves a null attribute unset", () => {
    expect(
      render(
        `export default Visualization(({ tokens }) => (
  <rect fill={tokens.length > 5 ? "red" : null} width={1} />
));`,
      ),
    ).toBe('<rect width="1"></rect>');
  });
});
