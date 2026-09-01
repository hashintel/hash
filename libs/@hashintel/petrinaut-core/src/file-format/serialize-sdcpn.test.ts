import { describe, expect, it } from "vitest";

import { parseSDCPNDocument, parseSDCPNFile } from "./parse-sdcpn-file";
import { serializeSDCPN } from "./serialize-sdcpn";

const sourceDocument = {
  version: 1,
  meta: { generator: "Petrinaut" },
  title: "Test Net",
  description: "A test net",
  metadata: { source: "test" },
  places: [
    {
      id: "p1",
      name: "Place 1",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 100,
      y: 200,
    },
  ],
  transitions: [
    {
      id: "t1",
      name: "Transition 1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "true",
      transitionKernelCode: "const tokens = input.p1;\nreturn { p1: tokens };",
      x: 300,
      y: 200,
    },
  ],
  subnets: [
    {
      id: "subnet1",
      name: "Subnet 1",
      description: "A subnet",
      metadata: { origin: "test" },
      places: [],
      transitions: [],
    },
  ],
  componentInstances: [
    { id: "instance1", name: "Instance 1", subnetId: "subnet1", x: 0, y: 0 },
  ],
  types: [
    {
      id: "color1",
      name: "Ticket",
      iconSlug: "circle",
      displayColor: "#1E90FF",
      elements: [
        {
          elementId: "element1",
          name: "ticket_id",
          type: "string",
          identityRef: "identity-ticket",
        },
      ],
    },
  ],
  identities: [
    {
      id: "identity-ticket",
      name: "Ticket",
      keyElementTypes: ["string"],
    },
  ],
  statusViews: [
    {
      id: "view1",
      name: "Ticket status",
      identityRef: "identity-ticket",
      labels: [
        {
          id: "label1",
          name: "In Progress",
          displayColor: "#1E90FF",
          places: ["p1", "instance1::p1"],
          tokenCondition: "attempts === 0",
        },
        {
          id: "label2",
          name: "Gone",
          displayColor: "#333333",
          places: [],
          isExit: true,
        },
      ],
    },
  ],
};

const parseFixture = () => {
  const parsed = parseSDCPNFile(sourceDocument);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.sdcpn;
};

describe("serializeSDCPN", () => {
  it("serializes to YAML by default and round-trips through parseSDCPNDocument", () => {
    const sdcpn = parseFixture();

    const text = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
    });

    expect(text).toContain("version: 1");
    expect(text).toContain("transitionKernelCode: |-");
    expect(() => JSON.parse(text) as unknown).toThrow();

    const reimported = parseSDCPNDocument(text);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.sdcpn).toEqual(sdcpn);
    expect(reimported.hadMissingPositions).toBe(false);
  });

  it("serializes to JSON on request and round-trips through parseSDCPNDocument", () => {
    const sdcpn = parseFixture();

    const text = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
      format: "json",
    });

    expect(JSON.parse(text)).toMatchObject({ version: 1, title: "Test Net" });

    const reimported = parseSDCPNDocument(text);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.sdcpn).toEqual(sdcpn);
  });

  it("round-trips a visual-info-free YAML export, flagging missing positions", () => {
    const sdcpn = parseFixture();

    const text = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
      removeVisualInfo: true,
    });

    expect(text).not.toMatch(/^\s*'?x'?:/m);
    expect(text).not.toMatch(/^\s*'?y'?:/m);

    const reimported = parseSDCPNDocument(text);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.hadMissingPositions).toBe(true);
  });

  it("strips status label colours with removeVisualInfo and defaults them on import", () => {
    const sdcpn = parseFixture();

    const text = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
      removeVisualInfo: true,
      format: "json",
    });

    const document = JSON.parse(text) as {
      statusViews: { labels: { displayColor?: string }[] }[];
    };
    expect(document.statusViews[0]!.labels[0]!.displayColor).toBeUndefined();

    const reimported = parseSDCPNDocument(text);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.sdcpn.statusViews![0]!.labels[0]!.displayColor).toBe(
      "#808080",
    );
  });

  it("writes format metadata first, then the sections in dependency order", () => {
    const sdcpn = parseFixture();

    const yamlText = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
    });
    expect(yamlText.startsWith("version: 1\n")).toBe(true);

    const jsonText = serializeSDCPN({
      petriNetDefinition: sdcpn,
      title: "Test Net",
      format: "json",
    });
    const document = JSON.parse(jsonText) as Record<
      string,
      Record<string, unknown>[]
    >;
    expect(Object.keys(document)).toEqual([
      "version",
      "meta",
      "title",
      "description",
      "metadata",
      "parameters",
      "identities",
      "types",
      "differentialEquations",
      "subnets",
      "places",
      "componentInstances",
      "transitions",
      "metrics",
      "scenarios",
      "statusViews",
    ]);
    expect(Object.keys(document.subnets![0]!)).toEqual([
      "id",
      "name",
      "description",
      "metadata",
      "parameters",
      "types",
      "differentialEquations",
      "places",
      "componentInstances",
      "transitions",
    ]);
  });

  it("rejects text that is neither YAML nor JSON via parseSDCPNDocument", () => {
    const result = parseSDCPNDocument("places: [");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid SDCPN file");
    }
  });
});
