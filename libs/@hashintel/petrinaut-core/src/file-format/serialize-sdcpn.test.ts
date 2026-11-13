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
      places: [
        {
          id: "port1",
          name: "Port 1",
          colorId: null,
          dynamicsEnabled: false,
          isPort: true,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
    },
    {
      id: "subnet2",
      name: "Subnet 2",
      places: [
        {
          id: "inner1",
          name: "Inner 1",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
      componentInstances: [
        { id: "nested1", name: "Nested 1", subnetId: "subnet1", x: 0, y: 0 },
      ],
      fusions: [
        {
          id: "fusion2",
          members: [
            { kind: "place", placeId: "inner1" },
            {
              kind: "componentPort",
              componentInstanceId: "nested1",
              portPlaceId: "port1",
            },
          ],
        },
      ],
    },
  ],
  componentInstances: [
    { id: "instance1", name: "Instance 1", subnetId: "subnet1", x: 0, y: 0 },
  ],
  fusions: [
    {
      id: "fusion1",
      members: [
        { kind: "place", placeId: "p1" },
        {
          kind: "componentPort",
          componentInstanceId: "instance1",
          portPlaceId: "port1",
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
      "types",
      "differentialEquations",
      "subnets",
      "places",
      "componentInstances",
      "fusions",
      "transitions",
      "metrics",
      "scenarios",
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
    expect(Object.keys(document.subnets![1]!)).toEqual([
      "id",
      "name",
      "parameters",
      "types",
      "differentialEquations",
      "places",
      "componentInstances",
      "fusions",
      "transitions",
    ]);
  });

  it("writes no `fusions` key for a net that has none", () => {
    const { fusions: _fusions, ...withoutFusions } = sourceDocument;
    const parsed = parseSDCPNFile(withoutFusions);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    expect(parsed.sdcpn).not.toHaveProperty("fusions");

    const text = serializeSDCPN({
      petriNetDefinition: parsed.sdcpn,
      title: "Test Net",
      format: "json",
    });
    expect(JSON.parse(text)).not.toHaveProperty("fusions");
  });

  it("reads a fusion that carries a key this build does not know", () => {
    const parsed = parseSDCPNFile({
      ...sourceDocument,
      fusions: sourceDocument.fusions.map((fusion) => ({
        ...fusion,
        addedLater: true,
      })),
    });

    expect(parsed.ok).toBe(true);
  });

  it("reads a fusion the editor would refuse, for the checks to report", () => {
    const [first] = sourceDocument.fusions;
    const parsed = parseSDCPNFile({
      ...sourceDocument,
      fusions: [{ ...first!, members: first!.members.slice(0, 1) }],
    });

    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    expect(parsed.sdcpn.fusions?.[0]?.members).toHaveLength(1);
  });

  it("rejects text that is neither YAML nor JSON via parseSDCPNDocument", () => {
    const result = parseSDCPNDocument("places: [");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid SDCPN file");
    }
  });
});
