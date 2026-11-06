import { describe, expect, it } from "vitest";

import {
  buildConversionGroups,
  conversionRowStatesFromRows,
  conversionRowsForViewer,
  conversionsFromFactor,
  newConversionRowState,
  parseConversionFactor,
  planConversionUpdates,
  singularize,
} from "./conversion-config";

import type {
  BaseUrl,
  Conversions,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";

const baseUrl = (name: string) =>
  `https://example.com/@test/types/data-type/${name}/` as BaseUrl;

const makeDataType = (
  name: string,
  conversions?: Record<string, Conversions>,
): DataTypeWithMetadata =>
  ({
    schema: {
      $id: `${baseUrl(name.toLowerCase())}v/1` as VersionedUrl,
      title: name,
      type: "number",
    },
    metadata: {
      recordId: { baseUrl: baseUrl(name.toLowerCase()), version: 1 },
      conversions,
    },
  }) as unknown as DataTypeWithMetadata;

const multiply = (factor: number): Conversions => ({
  to: { expression: ["*", "self", { const: factor, type: "number" }] },
  from: { expression: ["/", "self", { const: factor, type: "number" }] },
});

/** The system convention: spokes store a conversion targeting the hub */
const lengthTypes = {
  [baseUrl("metre")]: makeDataType("Metre"),
  [baseUrl("kilometre")]: makeDataType("Kilometre", {
    [baseUrl("metre")]: multiply(1000),
  }),
  [baseUrl("centimetre")]: makeDataType("Centimetre", {
    [baseUrl("metre")]: {
      to: { expression: ["/", "self", { const: 100, type: "number" }] },
      from: { expression: ["*", "self", { const: 100, type: "number" }] },
    },
  }),
};

describe("parseConversionFactor", () => {
  it("reads multiply and divide expressions as factors", () => {
    expect(parseConversionFactor(multiply(1000))).toBe(1000);
    expect(
      parseConversionFactor({
        to: { expression: ["/", "self", { const: 100, type: "number" }] },
        from: { expression: ["*", "self", { const: 100, type: "number" }] },
      }),
    ).toBe(0.01);
    expect(
      parseConversionFactor({
        to: { expression: ["*", { const: 2, type: "number" }, "self"] },
        from: { expression: ["/", "self", { const: 2, type: "number" }] },
      }),
    ).toBe(2);
  });

  it("returns null for formulas", () => {
    expect(
      parseConversionFactor({
        to: {
          expression: [
            "*",
            ["+", "self", { const: 32, type: "number" }],
            { const: 5, type: "number" },
          ],
        },
        from: { expression: ["/", "self", { const: 5, type: "number" }] },
      }),
    ).toBeNull();
  });

  it("round-trips factors built by conversionsFromFactor", () => {
    expect(parseConversionFactor(conversionsFromFactor(60))).toBe(60);
    expect(parseConversionFactor(conversionsFromFactor(0.01))).toBe(0.01);
  });
});

describe("buildConversionGroups", () => {
  it("groups spoke-stored units around the hub as canonical", () => {
    const groups = buildConversionGroups(lengthTypes);
    const group = groups.get(baseUrl("centimetre"));

    expect(group?.canonicalBaseUrl).toBe(baseUrl("metre"));
    expect(group?.factorsToCanonical.get(baseUrl("kilometre"))).toBe(1000);
    expect(group?.factorsToCanonical.get(baseUrl("centimetre"))).toBe(0.01);
    expect(groups.get(baseUrl("metre"))).toBe(group);
  });

  it("groups hub-stored units around the holder as canonical", () => {
    const groups = buildConversionGroups({
      [baseUrl("second")]: makeDataType("Second", {
        [baseUrl("minute")]: multiply(1 / 60),
        [baseUrl("hour")]: multiply(1 / 3600),
      }),
      [baseUrl("minute")]: makeDataType("Minute"),
      [baseUrl("hour")]: makeDataType("Hour"),
    });

    const group = groups.get(baseUrl("minute"));
    expect(group?.canonicalBaseUrl).toBe(baseUrl("second"));
    expect(group?.factorsToCanonical.get(baseUrl("minute"))).toBeCloseTo(60);
  });
});

describe("conversionRowsForViewer", () => {
  const groups = buildConversionGroups(lengthTypes);

  it("shows a definer its own entry plus composed group members", () => {
    const rows = conversionRowsForViewer({
      viewedBaseUrl: baseUrl("centimetre"),
      group: groups.get(baseUrl("centimetre"))!,
    });

    const metre = rows.find((row) => row.targetBaseUrl === baseUrl("metre"));
    expect(metre).toMatchObject({
      factor: 0.01,
      storedOnBaseUrl: baseUrl("centimetre"),
      viaCanonical: false,
    });

    const kilometre = rows.find(
      (row) => row.targetBaseUrl === baseUrl("kilometre"),
    );
    expect(kilometre?.viaCanonical).toBe(true);
    expect(kilometre?.factor).toBeCloseTo(0.00001);
  });

  it("reverses entries stored on the other member for the hub's view", () => {
    const rows = conversionRowsForViewer({
      viewedBaseUrl: baseUrl("metre"),
      group: groups.get(baseUrl("metre"))!,
    });

    const kilometre = rows.find(
      (row) => row.targetBaseUrl === baseUrl("kilometre"),
    );
    expect(kilometre).toMatchObject({
      factor: 0.001,
      storedOnBaseUrl: baseUrl("kilometre"),
      viaCanonical: false,
    });
  });
});

describe("planConversionUpdates", () => {
  const groups = buildConversionGroups(lengthTypes);

  it("rewrites a changed pairing where it is stored, reversed as needed", () => {
    // Viewing Metre, changing the Kilometre pairing (stored on Kilometre)
    const initialRows = conversionRowsForViewer({
      viewedBaseUrl: baseUrl("metre"),
      group: groups.get(baseUrl("metre"))!,
    });

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("metre"),
      desiredRows: initialRows.map((row) =>
        row.targetBaseUrl === baseUrl("kilometre")
          ? { targetBaseUrl: row.targetBaseUrl, factor: 0.0005 }
          : { targetBaseUrl: row.targetBaseUrl, factor: row.factor! },
      ),
      initialRows,
      groups,
      latestDataTypes: lengthTypes,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]!.baseUrl).toBe(baseUrl("kilometre"));
    expect(parseConversionFactor(plan[0]!.conversions[baseUrl("metre")]!)).toBe(
      2000,
    );
  });

  it("removes a deleted pairing from its storing type", () => {
    const initialRows = conversionRowsForViewer({
      viewedBaseUrl: baseUrl("centimetre"),
      group: groups.get(baseUrl("centimetre"))!,
    });

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("centimetre"),
      desiredRows: [],
      initialRows,
      groups,
      latestDataTypes: lengthTypes,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]!.baseUrl).toBe(baseUrl("centimetre"));
    expect(plan[0]!.conversions).toEqual({});
  });

  it("stores a first conversion on the type itself as a new canonical", () => {
    const standalone = {
      [baseUrl("day")]: makeDataType("Day"),
      [baseUrl("week")]: makeDataType("Week"),
    };

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("week"),
      desiredRows: [{ targetBaseUrl: baseUrl("day"), factor: 7 }],
      initialRows: [],
      groups: buildConversionGroups(standalone),
      latestDataTypes: standalone,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]!.baseUrl).toBe(baseUrl("week"));
    expect(parseConversionFactor(plan[0]!.conversions[baseUrl("day")]!)).toBe(
      7,
    );
  });

  it("joins an existing group as a spoke without absorbing its hub", () => {
    // Second holds minute + hour (hub-stored); fortnight has no conversions
    const types = {
      [baseUrl("second")]: makeDataType("Second", {
        [baseUrl("minute")]: multiply(1 / 60),
        [baseUrl("hour")]: multiply(1 / 3600),
      }),
      [baseUrl("minute")]: makeDataType("Minute"),
      [baseUrl("hour")]: makeDataType("Hour"),
      [baseUrl("fortnight")]: makeDataType("Fortnight"),
    };

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("fortnight"),
      desiredRows: [{ targetBaseUrl: baseUrl("minute"), factor: 20160 }],
      initialRows: [],
      groups: buildConversionGroups(types),
      latestDataTypes: types,
    });

    // Only the new type is written — the established hub keeps its entries
    expect(plan).toHaveLength(1);
    expect(plan[0]!.baseUrl).toBe(baseUrl("fortnight"));
    expect(
      parseConversionFactor(plan[0]!.conversions[baseUrl("minute")]!),
    ).toBe(20160);
  });

  it("merges a second group into the surviving canonical and clears the absorbed one", () => {
    // Group A: metre hub (spoke-stored); group B: second holds minute + hour
    const twoGroups = {
      ...lengthTypes,
      [baseUrl("second")]: makeDataType("Second", {
        [baseUrl("minute")]: multiply(1 / 60),
        [baseUrl("hour")]: multiply(1 / 3600),
      }),
      [baseUrl("minute")]: makeDataType("Minute"),
      [baseUrl("hour")]: makeDataType("Hour"),
    };
    const allGroups = buildConversionGroups(twoGroups);
    const metreGroup = allGroups.get(baseUrl("metre"))!;

    const initialRows = conversionRowsForViewer({
      viewedBaseUrl: baseUrl("metre"),
      group: metreGroup,
    });

    // "1 metre = 2 minutes" — nonsense physically, fine structurally
    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("metre"),
      desiredRows: [
        ...initialRows.map((row) => ({
          targetBaseUrl: row.targetBaseUrl,
          factor: row.factor!,
        })),
        { targetBaseUrl: baseUrl("minute"), factor: 2 },
      ],
      initialRows,
      groups: allGroups,
      latestDataTypes: twoGroups,
    });

    const survivor = plan.find((entry) => entry.baseUrl === baseUrl("metre"));
    const absorbed = plan.find((entry) => entry.baseUrl === baseUrl("second"));

    // Metre (surviving canonical) gains the new pairing plus the absorbed
    // group's members, re-composed; Second is cleared
    expect(
      parseConversionFactor(survivor!.conversions[baseUrl("minute")]!),
    ).toBe(2);
    // 1 metre = 2 minutes = 120 seconds
    expect(
      parseConversionFactor(survivor!.conversions[baseUrl("second")]!),
    ).toBeCloseTo(120);
    expect(
      parseConversionFactor(survivor!.conversions[baseUrl("hour")]!),
    ).toBeCloseTo(2 / 60);
    expect(absorbed!.conversions).toEqual({});
  });
});

describe("conversionRowStatesFromRows", () => {
  it("presents recurring reciprocals as divisions and short decimals as multiplications", () => {
    const [recurring, short] = conversionRowStatesFromRows([
      {
        targetBaseUrl: baseUrl("hour"),
        factor: 1 / 60,
        storedOnBaseUrl: null,
        viaCanonical: false,
      },
      {
        targetBaseUrl: baseUrl("metre"),
        factor: 0.01,
        storedOnBaseUrl: null,
        viaCanonical: false,
      },
    ]);

    expect(recurring).toMatchObject({ operator: "divide", value: 60 });
    expect(short).toMatchObject({ operator: "multiply", value: 0.01 });
  });
});

describe("singularize", () => {
  it("drops a plain trailing s only", () => {
    expect(singularize("Centimetres")).toBe("Centimetre");
    expect(singularize("Celsius")).toBe("Celsius");
    expect(singularize("Mass")).toBe("Mass");
  });
});

describe("newConversionRowState", () => {
  it("never reuses a live row's key across add-remove-add sequences", () => {
    const first = newConversionRowState([]);
    const second = newConversionRowState([first]);

    // Remove `first`, then add again — the new key must not collide with
    // the surviving row's
    const third = newConversionRowState([second]);

    expect(second.key).not.toBe(first.key);
    expect(third.key).not.toBe(second.key);
  });
});
