import { describe, expect, it } from "vitest";

import { parseSDCPNDocument, parseSDCPNFile } from "./parse-sdcpn-file";
import { serializeSDCPN } from "./serialize-sdcpn";

const sourceDocument = {
  version: 1,
  meta: { generator: "Petrinaut" },
  title: "Test Net",
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

    expect(text).not.toContain("x:");
    expect(text).not.toContain("y:");

    const reimported = parseSDCPNDocument(text);
    expect(reimported.ok).toBe(true);
    if (!reimported.ok) return;
    expect(reimported.hadMissingPositions).toBe(true);
  });

  it("rejects text that is neither YAML nor JSON via parseSDCPNDocument", () => {
    const result = parseSDCPNDocument("places: [");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid SDCPN file");
    }
  });
});
