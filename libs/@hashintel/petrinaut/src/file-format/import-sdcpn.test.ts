import { describe, expect, it } from "vitest";

import { parseSDCPNFile } from "./import-sdcpn";

const minimalPlace = {
  id: "p1",
  name: "Place 1",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 100,
  y: 200,
};

const minimalTransition = {
  id: "t1",
  name: "Transition 1",
  inputArcs: [{ placeId: "p1", weight: 1 }],
  outputArcs: [],
  lambdaType: "predicate" as const,
  lambdaCode: "true",
  transitionKernelCode: "",
  x: 300,
  y: 200,
};

const minimalSDCPN = {
  title: "Test Net",
  places: [minimalPlace],
  transitions: [minimalTransition],
};

describe("parseSDCPNFile", () => {
  describe("versioned format (v1)", () => {
    it("parses a valid versioned file", () => {
      const result = parseSDCPNFile({
        version: 1,
        meta: { generator: "Petrinaut" },
        ...minimalSDCPN,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.sdcpn.title).toBe("Test Net");
      expect(result.sdcpn.places).toHaveLength(1);
      expect(result.sdcpn.transitions).toHaveLength(1);
      expect(result.hadMissingPositions).toBe(false);
    });

    it("defaults optional arrays (types, parameters, differentialEquations)", () => {
      const result = parseSDCPNFile({
        version: 1,
        meta: { generator: "Petrinaut" },
        ...minimalSDCPN,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.sdcpn.types).toEqual([]);
      expect(result.sdcpn.parameters).toEqual([]);
      expect(result.sdcpn.differentialEquations).toEqual([]);
    });

    it("strips version and meta from the returned sdcpn", () => {
      const result = parseSDCPNFile({
        version: 1,
        meta: { generator: "Petrinaut" },
        ...minimalSDCPN,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect("version" in result.sdcpn).toBe(false);
      expect("meta" in result.sdcpn).toBe(false);
    });
  });

  describe("legacy format (no version)", () => {
    it("parses a valid legacy file", () => {
      const result = parseSDCPNFile(minimalSDCPN);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.sdcpn.title).toBe("Test Net");
      expect(result.sdcpn.places).toHaveLength(1);
    });

    it("defaults optional arrays", () => {
      const result = parseSDCPNFile(minimalSDCPN);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.sdcpn.types).toEqual([]);
      expect(result.sdcpn.parameters).toEqual([]);
      expect(result.sdcpn.differentialEquations).toEqual([]);
    });
  });

  describe("missing positions", () => {
    it("reports hadMissingPositions when places lack x/y", () => {
      const result = parseSDCPNFile({
        ...minimalSDCPN,
        places: [{ ...minimalPlace, x: undefined, y: undefined }],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.hadMissingPositions).toBe(true);
    });

    it("reports hadMissingPositions when transitions lack x/y", () => {
      const result = parseSDCPNFile({
        ...minimalSDCPN,
        transitions: [{ ...minimalTransition, x: undefined, y: undefined }],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.hadMissingPositions).toBe(true);
    });

    it("fills missing positions with 0", () => {
      const result = parseSDCPNFile({
        ...minimalSDCPN,
        places: [{ ...minimalPlace, x: undefined, y: undefined }],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.sdcpn.places[0]!.x).toBe(0);
      expect(result.sdcpn.places[0]!.y).toBe(0);
    });

    it("does not report missing positions when only type visual info is absent", () => {
      const result = parseSDCPNFile({
        ...minimalSDCPN,
        types: [
          {
            id: "c1",
            name: "Color",
            elements: [{ elementId: "e1", name: "val", type: "real" }],
          },
        ],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.hadMissingPositions).toBe(false);
    });

    it("fills missing type visual info with defaults", () => {
      const result = parseSDCPNFile({
        ...minimalSDCPN,
        types: [
          {
            id: "c1",
            name: "Color",
            elements: [{ elementId: "e1", name: "val", type: "real" }],
          },
        ],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.sdcpn.types[0]!.iconSlug).toBe("circle");
      expect(result.sdcpn.types[0]!.displayColor).toBe("#808080");
    });

    it("preserves existing positions", () => {
      const result = parseSDCPNFile(minimalSDCPN);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.hadMissingPositions).toBe(false);
      expect(result.sdcpn.places[0]!.x).toBe(100);
      expect(result.sdcpn.places[0]!.y).toBe(200);
    });
  });

  describe("version handling", () => {
    it("rejects unsupported future versions", () => {
      const result = parseSDCPNFile({
        version: 999,
        meta: { generator: "Petrinaut" },
        ...minimalSDCPN,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe("Unsupported SDCPN file format version");
    });

    it("shows Zod errors for supported version with invalid structure", () => {
      const result = parseSDCPNFile({
        version: 1,
        meta: { generator: "Petrinaut" },
        title: "Test",
        // missing places and transitions
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("Invalid SDCPN file");
      expect(result.error).not.toContain("Unsupported");
    });

    it("rejects version: 0", () => {
      const result = parseSDCPNFile({
        version: 0,
        meta: { generator: "Petrinaut" },
        ...minimalSDCPN,
      });

      expect(result.ok).toBe(false);
    });
  });

  describe("invalid input", () => {
    it("rejects null", () => {
      const result = parseSDCPNFile(null);
      expect(result.ok).toBe(false);
    });

    it("rejects a string", () => {
      const result = parseSDCPNFile("not a json object");
      expect(result.ok).toBe(false);
    });

    it("rejects an empty object", () => {
      const result = parseSDCPNFile({});
      expect(result.ok).toBe(false);
    });

    it("rejects a file missing required fields", () => {
      const result = parseSDCPNFile({
        title: "Test",
        places: [],
        // missing transitions
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("Invalid SDCPN file");
    });

    it("includes error details for invalid files", () => {
      const result = parseSDCPNFile({ title: "Test" });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.length).toBeGreaterThan(0);
    });
  });
});
