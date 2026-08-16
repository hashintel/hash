import { describe, expect, it } from "vitest";

import {
  createUserKeyedRecord,
  describeDangerousSdcpnKeys,
  findDangerousSdcpnKeys,
  getOwn,
  isDangerousRecordKey,
} from "./record-keys";

import type { SDCPN } from "../types/sdcpn";

const emptySdcpn = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
});

describe("isDangerousRecordKey", () => {
  it("rejects every Object.prototype member name and `prototype`", () => {
    for (const key of [
      "__proto__",
      "constructor",
      "prototype",
      "toString",
      "valueOf",
      "hasOwnProperty",
    ]) {
      expect(isDangerousRecordKey(key)).toBe(true);
    }
  });

  it("accepts ordinary identifiers", () => {
    for (const key of ["p1", "crash_threshold", "Constructor", "proto"]) {
      expect(isDangerousRecordKey(key)).toBe(false);
    }
  });
});

describe("createUserKeyedRecord", () => {
  it("stores `__proto__` as an ordinary own property", () => {
    const record = createUserKeyedRecord<number>();
    record.__proto__ = 5;
    expect(Object.hasOwn(record, "__proto__")).toBe(true);
    expect(record.__proto__).toBe(5);
    expect(Object.getPrototypeOf(record)).toBe(null);
  });

  it("returns undefined for missing Object.prototype member names", () => {
    const record = createUserKeyedRecord<number>();
    expect(record["constructor"]).toBeUndefined();
    expect(record["toString"]).toBeUndefined();
  });
});

describe("getOwn", () => {
  it("does not fall through to Object.prototype on plain objects", () => {
    const record: Record<string, number> = { p1: 1 };
    expect(getOwn(record, "p1")).toBe(1);
    expect(getOwn(record, "constructor")).toBeUndefined();
    expect(getOwn(record, "toString")).toBeUndefined();
  });

  it("reads own `__proto__` data properties revived by JSON.parse", () => {
    const record = JSON.parse('{"__proto__": 7}') as Record<string, number>;
    expect(getOwn(record, "__proto__")).toBe(7);
  });
});

describe("findDangerousSdcpnKeys", () => {
  it("returns nothing for a net with ordinary identifiers", () => {
    const sdcpn = emptySdcpn();
    sdcpn.places.push({
      id: "p1",
      name: "Place 1",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });
    expect(findDangerousSdcpnKeys(sdcpn)).toEqual([]);
  });

  it("collects dangerous ids across every entity kind", () => {
    const sdcpn: SDCPN = {
      places: [
        {
          id: "__proto__",
          name: "Place 1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "constructor",
          name: "Transition 1",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
      types: [
        {
          id: "toString",
          name: "Colour 1",
          iconSlug: "circle",
          displayColor: "#808080",
          elements: [{ elementId: "e1", name: "valueOf", type: "real" }],
        },
      ],
      differentialEquations: [
        { id: "hasOwnProperty", name: "DE 1", colorId: null, code: "" },
      ],
      parameters: [
        {
          id: "prototype",
          name: "Parameter 1",
          variableName: "constructor",
          type: "real",
          defaultValue: "1",
        },
      ],
      metrics: [{ id: "__defineGetter__", name: "Metric 1", code: "" }],
      scenarios: [
        {
          id: "isPrototypeOf",
          name: "Scenario 1",
          scenarioParameters: [
            { identifier: "constructor", type: "real", default: 1 },
          ],
          parameterOverrides: {},
          initialState: { type: "per_place", content: {} },
        },
      ],
    };

    const found = findDangerousSdcpnKeys(sdcpn);
    expect(found).toContainEqual({ location: "place id", key: "__proto__" });
    expect(found).toContainEqual({
      location: "transition id",
      key: "constructor",
    });
    expect(found).toContainEqual({ location: "colour id", key: "toString" });
    expect(found).toContainEqual({
      location: "colour element name",
      key: "valueOf",
    });
    expect(found).toContainEqual({
      location: "differential equation id",
      key: "hasOwnProperty",
    });
    expect(found).toContainEqual({
      location: "parameter id",
      key: "prototype",
    });
    expect(found).toContainEqual({
      location: "parameter variable name",
      key: "constructor",
    });
    expect(found).toContainEqual({
      location: "metric id",
      key: "__defineGetter__",
    });
    expect(found).toContainEqual({
      location: "scenario id",
      key: "isPrototypeOf",
    });
    expect(found).toContainEqual({
      location: "scenario parameter identifier",
      key: "constructor",
    });
  });

  it("walks subnets", () => {
    const sdcpn = emptySdcpn();
    sdcpn.subnets = [
      {
        id: "s1",
        name: "Subnet 1",
        places: [
          {
            id: "constructor",
            name: "Place 1",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        ],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
    ];

    expect(findDangerousSdcpnKeys(sdcpn)).toEqual([
      { location: 'subnet "s1" place id', key: "constructor" },
    ]);
  });

  it("describes findings in one sentence", () => {
    expect(
      describeDangerousSdcpnKeys([{ location: "place id", key: "__proto__" }]),
    ).toBe(
      'The net uses reserved JavaScript property names as identifiers: place id "__proto__". Rename them before running.',
    );
  });
});
