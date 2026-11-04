import ts from "@typescript/typescript6";
import { describe, expect, it } from "vitest";

import {
  deploymentPipelineSDCPN,
  probabilisticSatellitesSDCPN,
  supplyChainProfit,
  supplyChainWithDisruption,
} from "../../examples";
import { VisualizerLanguageServer } from "./create-visualizer-language-service";
import { getItemFilePath } from "./file-paths";
import { createSDCPN } from "./helper/create-sdcpn";

import type { SDCPN } from "../../types/sdcpn";

/** Cursor marker used in test code strings to indicate the query position. */
const CURSOR = "∫";

function parseCursor(codeWithCursor: string): { offset: number; code: string } {
  const offset = codeWithCursor.indexOf(CURSOR);
  if (offset === -1) {
    throw new Error(`No cursor marker \`${CURSOR}\` found in code`);
  }
  return {
    offset,
    code: codeWithCursor.slice(0, offset) + codeWithCursor.slice(offset + 1),
  };
}

function createServer(sdcpn: SDCPN): VisualizerLanguageServer {
  const server = new VisualizerLanguageServer();
  server.syncFiles(sdcpn);
  return server;
}

const codePath = (placeId: string) =>
  getItemFilePath("place-visualizer-code", { placeId });

function diagnosticsFor(
  server: VisualizerLanguageServer,
  placeId: string,
): ts.Diagnostic[] {
  const filePath = codePath(placeId);
  return [
    ...server.getSyntacticDiagnostics(filePath),
    ...server.getSemanticDiagnostics(filePath),
  ];
}

/** `TS<code>: <message>` per diagnostic, so a failing assertion names the error. */
const describeDiagnostics = (diagnostics: ts.Diagnostic[]): string[] =>
  diagnostics.map(
    (diagnostic) =>
      `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
  );

const baseSdcpn = createSDCPN({
  types: [
    {
      id: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
      elements: [
        { name: "x", type: "real" },
        { name: "y", type: "real" },
        { name: "id", type: "uuid" },
      ],
    },
  ],
  places: [
    {
      id: "p1",
      name: "Space",
      colorId: "f8e9d7c6-b5a4-3210-fedc-ba9876543210",
      visualizerCode: "",
    },
  ],
  parameters: [
    { id: "param1", variableName: "planet_radius", type: "real" },
    { id: "param2", variableName: "show_labels", type: "boolean" },
  ],
});

const withVisualizer = (visualizerCode: string): SDCPN => ({
  ...baseSdcpn,
  places: baseSdcpn.places.map((place) => ({ ...place, visualizerCode })),
});

describe("VisualizerLanguageServer diagnostics", () => {
  describe.each([
    probabilisticSatellitesSDCPN,
    deploymentPipelineSDCPN,
    supplyChainWithDisruption,
    supplyChainProfit,
  ])("$title", (example) => {
    const sdcpn = example.petriNetDefinition;
    const placesWithVisualizers = sdcpn.places.filter(
      (place) => place.visualizerCode !== undefined,
    );
    const server = createServer(sdcpn);

    it.for(placesWithVisualizers)(
      "type-checks the visualizer of $name with no errors",
      (place) => {
        expect(describeDiagnostics(diagnosticsFor(server, place.id))).toEqual(
          [],
        );
      },
    );
  });

  it("reports host globals as unknown names, positioned in the user's code", () => {
    const code = [
      `const data = fetch("https://example.com");`,
      `const width = window.innerWidth;`,
      `return <Visualizer.Svg>{tokens.length}</Visualizer.Svg>;`,
    ].join("\n");
    const diagnostics = diagnosticsFor(
      createServer(withVisualizer(code)),
      "p1",
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      2304, 2304,
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.start)).toEqual([
      code.indexOf("fetch"),
      code.indexOf("window"),
    ]);
  });

  it("reports an import from react as an unresolved module", () => {
    const code = [
      `import { useState } from "react";`,
      `export default Visualization(() => <Visualizer.Svg />);`,
    ].join("\n");
    const diagnostics = diagnosticsFor(
      createServer(withVisualizer(code)),
      "p1",
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([2307]);
  });

  it("reports React as an unknown name rather than a UMD global", () => {
    const code = `export default Visualization(() => {\n  const [n] = React.useState(0);\n  return <Visualizer.Svg>{n}</Visualizer.Svg>;\n});`;
    const diagnostics = diagnosticsFor(
      createServer(withVisualizer(code)),
      "p1",
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([2304]);
  });

  it("reports a misspelt SVG attribute against the element's props", () => {
    const code = `export default Visualization(() => <Visualizer.Svg viewBox="0 0 10 10" strokeWidht={2} />);`;
    const diagnostics = diagnosticsFor(
      createServer(withVisualizer(code)),
      "p1",
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([2322]);
    expect(describeDiagnostics(diagnostics)[0]).toContain("strokeWidht");
  });

  it("reports an attribute the place's type lacks", () => {
    const code = `export default Visualization(({ tokens }) => (\n  <Visualizer.Svg>{tokens.map((token) => <circle key={String(token.id)} cx={token.x} cy={token.z} />)}</Visualizer.Svg>\n));`;
    const diagnostics = diagnosticsFor(
      createServer(withVisualizer(code)),
      "p1",
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([2339]);
    expect(diagnostics[0]?.start).toBe(code.indexOf("z}"));
  });

  it("accepts style objects with string and number values", () => {
    const code = `export default Visualization(() => <Visualizer.Svg><g style={{ opacity: 0.5, fill: "red" }} /></Visualizer.Svg>);`;
    const diagnostics = diagnosticsFor(
      createServer(withVisualizer(code)),
      "p1",
    );

    expect(describeDiagnostics(diagnostics)).toEqual([]);
  });

  it("keeps diagnostics positioned when switching between bodies and legacy modules", () => {
    const server = createServer(withVisualizer("return <Visualizer.Svg />;"));
    for (const code of [
      "return <Visualizer.Svg><text>export default</text>{tokens[0].missing}</Visualizer.Svg>;",
      "return <Visualizer.Svg>{tokens[0].missing}</Visualizer.Svg>;",
      "export default Visualization(({ tokens }) => <Visualizer.Svg>{tokens[0].missing}</Visualizer.Svg>);",
      "return <Visualizer.Svg>{parameters.missing}</Visualizer.Svg>;",
    ]) {
      server.updateDocumentContent(codePath("p1"), code);
      expect(diagnosticsFor(server, "p1")).toMatchObject([
        { code: 2339, start: code.indexOf("missing"), length: 7 },
      ]);
    }
  });

  it.each([
    "<div />",
    "<svg />",
    "<Visualizer.Svg width={10} />",
    '<Visualizer.Svg origin="bottom-left" />',
    '<Visualizer.Svg navigation="zoom" />',
    '<Visualizer.Svg onClick="handler" />',
    '<Visualizer.Svg href="#target" />',
  ])("rejects unsupported drawing options: %s", (element) => {
    expect(
      diagnosticsFor(createServer(withVisualizer(`return ${element};`)), "p1"),
    ).not.toEqual([]);
  });

  it("checks nothing when the colours extension is off", () => {
    const server = new VisualizerLanguageServer();
    server.syncFiles(
      withVisualizer(
        `export default Visualization(() => <Visualizer.Svg>{fetch("x")}</Visualizer.Svg>);`,
      ),
      {
        colors: false,
        stochasticity: true,
        dynamics: true,
        parameters: true,
        subnets: true,
      },
    );

    expect(server.getFileContent(codePath("p1"))).toBeUndefined();
  });
});

describe("VisualizerLanguageServer completions and hover", () => {
  function completionNames(codeWithCursor: string): string[] {
    const { offset, code } = parseCursor(codeWithCursor);
    const server = createServer(withVisualizer(code));
    const completions = server.getCompletionsAtPosition(
      codePath("p1"),
      offset,
      undefined,
    );
    return (completions?.entries ?? []).map((entry) => entry.name);
  }

  it("completes SVG attributes", () => {
    const names = completionNames(`return <Visualizer.Svg viewB${CURSOR} />;`);

    expect(names).toContain("viewBox");
    expect(names).toContain("backgroundColor");
    expect(names).toContain("origin");
    expect(names).toContain("navigation");
    expect(names).not.toContain("width");
    expect(names).not.toContain("style");
    expect(names).not.toContain("onClick");
    expect(names).not.toContain("href");
    expect(names).not.toContain("ref");
  });

  it("completes drawing styles without window layout styles", () => {
    const names = completionNames(
      `return <Visualizer.Svg><g style={{ ${CURSOR} }} /></Visualizer.Svg>;`,
    );
    expect(names).toContain("backgroundColor");
    expect(names).toContain("fill");
    expect(names).not.toContain("width");
    expect(names).not.toContain("borderRadius");
  });

  it("completes the net's parameters", () => {
    const names = completionNames(
      `return <Visualizer.Svg>{parameters.${CURSOR}}</Visualizer.Svg>;`,
    );

    expect(names).toEqual(["planet_radius", "show_labels"]);
  });

  it("completes a token's attributes", () => {
    const names = completionNames(
      `return <Visualizer.Svg>{tokens[0].${CURSOR}}</Visualizer.Svg>;`,
    );

    expect(names).toEqual(["id", "x", "y"]);
  });

  it("shows the token type on hover, with the span in the user's code", () => {
    const { offset, code } = parseCursor(
      `return <Visualizer.Svg>{tok${CURSOR}ens.length}</Visualizer.Svg>;`,
    );
    const server = createServer(withVisualizer(code));
    const info = server.getQuickInfoAtPosition(codePath("p1"), offset);

    expect(ts.displayPartsToString(info?.displayParts)).toBe(
      "(parameter) tokens: Tokens",
    );
    expect(info?.textSpan.start).toBe(code.indexOf("tokens"));
  });
});
