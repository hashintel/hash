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

  it("stores a typed reversed value exactly, as a division", () => {
    // "1 foot = 30.48 centimetres" typed as 30.48 → factor 1/30.48
    expect(conversionsFromFactor(1 / 30.48).to.expression).toEqual([
      "/",
      "self",
      { const: 30.48, type: "number" },
    ]);
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

  /** Spoke-stored time group: minute and hour each aim at the second hub */
  const timeTypes = {
    [baseUrl("second")]: makeDataType("Second"),
    [baseUrl("minute")]: makeDataType("Minute", {
      [baseUrl("second")]: multiply(60),
    }),
    [baseUrl("hour")]: makeDataType("Hour", {
      [baseUrl("second")]: multiply(3600),
    }),
  };

  const directRowsFor = (viewedBaseUrl: BaseUrl) =>
    conversionRowsForViewer({
      viewedBaseUrl,
      group: groups.get(viewedBaseUrl)!,
    }).filter((row) => !row.viaCanonical);

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
      latestDataTypes: lengthTypes,
      canWriteTo: () => true,
    });

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.baseUrl).toBe(baseUrl("kilometre"));
    expect(
      parseConversionFactor(plan.updates[0]!.conversions[baseUrl("metre")]!),
    ).toBe(2000);
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
      latestDataTypes: lengthTypes,
      canWriteTo: () => true,
    });

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.baseUrl).toBe(baseUrl("centimetre"));
    expect(plan.updates[0]!.conversions).toEqual({});
  });

  it("starts a new group stored on the viewed type when neither side has one", () => {
    const standalone = {
      [baseUrl("day")]: makeDataType("Day"),
      [baseUrl("week")]: makeDataType("Week"),
    };

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("week"),
      desiredRows: [{ targetBaseUrl: baseUrl("day"), factor: 7 }],
      initialRows: [],
      latestDataTypes: standalone,
      canWriteTo: () => true,
    });

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.baseUrl).toBe(baseUrl("week"));
    expect(
      parseConversionFactor(plan.updates[0]!.conversions[baseUrl("day")]!),
    ).toBe(7);
  });

  it("joins the viewed type to the target's group, aimed at its canonical", () => {
    // Pairing fortnight with minute must store fortnight → second: an entry
    // aimed at the spoke itself would take two hops to reach the other
    // members, which nothing resolves
    const types = {
      ...timeTypes,
      [baseUrl("fortnight")]: makeDataType("Fortnight"),
    };

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("fortnight"),
      desiredRows: [{ targetBaseUrl: baseUrl("minute"), factor: 20160 }],
      initialRows: [],
      latestDataTypes: types,
      canWriteTo: () => true,
    });

    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.baseUrl).toBe(baseUrl("fortnight"));
    expect(
      parseConversionFactor(plan.updates[0]!.conversions[baseUrl("second")]!),
    ).toBe(1209600);
  });

  it("joins an ungrouped target to the viewed type's group via its canonical", () => {
    // Centimetre's slot holds its metre entry, so the new pairing is stored
    // on the (ungrouped) target — aimed at the canonical, factor composed:
    // 1 centimetre = 0.5 inches, so 1 inch = 2 centimetres = 0.02 metres
    const types = {
      ...lengthTypes,
      [baseUrl("inch")]: makeDataType("Inch"),
    };
    const directRows = directRowsFor(baseUrl("centimetre"));

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("centimetre"),
      desiredRows: [
        ...directRows.map((row) => ({
          targetBaseUrl: row.targetBaseUrl,
          factor: row.factor!,
        })),
        { targetBaseUrl: baseUrl("inch"), factor: 0.5 },
      ],
      initialRows: directRows,
      latestDataTypes: types,
      canWriteTo: () => true,
    });

    expect(plan.unplacedTargets).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.baseUrl).toBe(baseUrl("inch"));
    expect(
      parseConversionFactor(plan.updates[0]!.conversions[baseUrl("metre")]!),
    ).toBe(0.02);
  });

  it("merges two groups instead of bridging them through chained hops", () => {
    // "1 centimetre = 2 seconds" — nonsense physically, fine structurally.
    // Every member of the absorbed time group is re-aimed at metre, so the
    // combined group stays a single-hub star.
    const twoGroups = { ...lengthTypes, ...timeTypes };
    const directRows = directRowsFor(baseUrl("centimetre"));

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("centimetre"),
      desiredRows: [
        ...directRows.map((row) => ({
          targetBaseUrl: row.targetBaseUrl,
          factor: row.factor!,
        })),
        { targetBaseUrl: baseUrl("second"), factor: 2 },
      ],
      initialRows: directRows,
      latestDataTypes: twoGroups,
      canWriteTo: () => true,
    });

    expect(plan.unplacedTargets).toEqual([]);
    expect(plan.updates.map((update) => update.baseUrl).sort()).toEqual(
      [baseUrl("hour"), baseUrl("minute"), baseUrl("second")].sort(),
    );

    const factorTo = (sourceName: string) =>
      parseConversionFactor(
        plan.updates.find((update) => update.baseUrl === baseUrl(sourceName))!
          .conversions[baseUrl("metre")]!,
      );
    // 1 cm = 2 s ⇒ 1 s = 0.5 cm = 0.005 m
    expect(factorTo("second")).toBeCloseTo(0.005);
    expect(factorTo("minute")).toBeCloseTo(0.3);
    expect(factorTo("hour")).toBeCloseTo(18);
  });

  it("absorbs the writable group when the other can't be rewritten", () => {
    const twoGroups = { ...lengthTypes, ...timeTypes };
    const timeMembers = new Set([
      baseUrl("second"),
      baseUrl("minute"),
      baseUrl("hour"),
    ]);
    const directRows = directRowsFor(baseUrl("centimetre"));

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("centimetre"),
      desiredRows: [
        ...directRows.map((row) => ({
          targetBaseUrl: row.targetBaseUrl,
          factor: row.factor!,
        })),
        { targetBaseUrl: baseUrl("second"), factor: 2 },
      ],
      initialRows: directRows,
      latestDataTypes: twoGroups,
      canWriteTo: (writeBaseUrl) => !timeMembers.has(writeBaseUrl),
    });

    // The length group is re-aimed at second instead
    expect(plan.unplacedTargets).toEqual([]);
    expect(plan.updates.map((update) => update.baseUrl).sort()).toEqual(
      [baseUrl("centimetre"), baseUrl("kilometre"), baseUrl("metre")].sort(),
    );

    const factorTo = (sourceName: string) =>
      parseConversionFactor(
        plan.updates.find((update) => update.baseUrl === baseUrl(sourceName))!
          .conversions[baseUrl("second")]!,
      );
    expect(factorTo("centimetre")).toBeCloseTo(2);
    expect(factorTo("metre")).toBeCloseTo(200);
    expect(factorTo("kilometre")).toBeCloseTo(200000);
  });

  it("skips joining through a target the caller can't write", () => {
    // The pairing could only be stored on the ungrouped target — joining the
    // viewed type's group republishes it, which the caller may not do
    const types = {
      ...lengthTypes,
      [baseUrl("inch")]: makeDataType("Inch"),
    };
    const directRows = directRowsFor(baseUrl("centimetre"));

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("centimetre"),
      desiredRows: [
        ...directRows.map((row) => ({
          targetBaseUrl: row.targetBaseUrl,
          factor: row.factor!,
        })),
        { targetBaseUrl: baseUrl("inch"), factor: 0.5 },
      ],
      initialRows: directRows,
      latestDataTypes: types,
      canWriteTo: (writeBaseUrl) => writeBaseUrl !== baseUrl("inch"),
    });

    expect(plan.unplacedTargets).toEqual([baseUrl("inch")]);
    expect(plan.updates).toEqual([]);
  });

  it("reports a merge neither side has permission to rewrite", () => {
    const twoGroups = { ...lengthTypes, ...timeTypes };
    const directRows = directRowsFor(baseUrl("centimetre"));

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("centimetre"),
      desiredRows: [
        ...directRows.map((row) => ({
          targetBaseUrl: row.targetBaseUrl,
          factor: row.factor!,
        })),
        { targetBaseUrl: baseUrl("second"), factor: 2 },
      ],
      initialRows: directRows,
      // Only the viewed type itself is writable: neither group can be
      // wholly re-aimed
      canWriteTo: (writeBaseUrl) => writeBaseUrl === baseUrl("centimetre"),
      latestDataTypes: twoGroups,
    });

    expect(plan.unplacedTargets).toEqual([baseUrl("second")]);
    expect(plan.updates).toEqual([]);
  });
});

describe("conversionRowStatesFromRows", () => {
  it("reverses stored factors into viewed-units-per-target values", () => {
    const [hour, metre] = conversionRowStatesFromRows([
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

    // "1 hour = 60 × 1 of these" / "1 metre = 100 × 1 of these"
    expect(hour).toMatchObject({ value: 60 });
    expect(metre).toMatchObject({ value: 100 });
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
