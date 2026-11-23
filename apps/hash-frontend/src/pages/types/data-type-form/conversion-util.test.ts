import { describe, expect, it } from "vitest";

import {
  buildConversionGroups,
  conversionRowStatesFromRows,
  conversionRowsForViewer,
  conversionsFromFactor,
  formatConversionExpression,
  mergeConversionRecords,
  newConversionRowState,
  parseConversionFactor,
  parseSimpleConversion,
  planConversionUpdates,
  severedConversionPairings,
} from "./conversion-util";

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

  it("stores an additive pairing in the viewed type's free slot", () => {
    const types = {
      [baseUrl("gauge")]: makeDataType("Gauge"),
      [baseUrl("absolute")]: makeDataType("Absolute"),
    };

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("gauge"),
      desiredRows: [
        {
          targetBaseUrl: baseUrl("absolute"),
          simple: { operator: "+", operand: 1 },
        },
      ],
      initialRows: [],
      latestDataTypes: types,
      canWriteTo: () => true,
    });

    expect(plan.unplacedTargets).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.baseUrl).toBe(baseUrl("gauge"));
    expect(plan.updates[0]!.conversions[baseUrl("absolute")]).toEqual({
      to: { expression: ["+", "self", { const: 1, type: "number" }] },
      from: { expression: ["-", "self", { const: 1, type: "number" }] },
    });
  });

  it("cannot place an additive pairing when the viewed type's slot is taken", () => {
    // Centimetre's slot already holds its metre entry: a map with a second
    // key would violate the store's one-entry-per-type constraint
    const types = {
      ...lengthTypes,
      [baseUrl("offset")]: makeDataType("Offset"),
    };
    const directRows = directRowsFor(baseUrl("centimetre"));

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("centimetre"),
      desiredRows: [
        ...directRows.map((row) => ({
          targetBaseUrl: row.targetBaseUrl,
          factor: row.factor!,
        })),
        {
          targetBaseUrl: baseUrl("offset"),
          simple: { operator: "+", operand: 10 },
        },
      ],
      initialRows: directRows,
      latestDataTypes: types,
      canWriteTo: () => true,
    });

    expect(plan.unplacedTargets).toEqual([baseUrl("offset")]);
    expect(plan.updates).toEqual([]);
  });

  it("places only the first of two additive pairings", () => {
    const types = {
      [baseUrl("gauge")]: makeDataType("Gauge"),
      [baseUrl("absolute")]: makeDataType("Absolute"),
      [baseUrl("alternative")]: makeDataType("Alternative"),
    };

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("gauge"),
      desiredRows: [
        {
          targetBaseUrl: baseUrl("absolute"),
          simple: { operator: "+", operand: 1 },
        },
        {
          targetBaseUrl: baseUrl("alternative"),
          simple: { operator: "-", operand: 2 },
        },
      ],
      initialRows: [],
      latestDataTypes: types,
      canWriteTo: () => true,
    });

    expect(plan.unplacedTargets).toEqual([baseUrl("alternative")]);
    expect(plan.updates).toHaveLength(1);
    expect(Object.keys(plan.updates[0]!.conversions)).toEqual([
      baseUrl("absolute"),
    ]);
  });

  it("severs a removed composed member where its edge is stored", () => {
    // Viewing centimetre, kilometre is composed through metre: severing it
    // deletes kilometre's own stored entry
    const directRows = directRowsFor(baseUrl("centimetre"));

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("centimetre"),
      desiredRows: directRows.map((row) => ({
        targetBaseUrl: row.targetBaseUrl,
        factor: row.factor!,
      })),
      initialRows: directRows,
      removedComposedTargets: [baseUrl("kilometre")],
      latestDataTypes: lengthTypes,
      canWriteTo: () => true,
    });

    expect(plan.unremovableTargets).toEqual([]);
    expect(plan.updates).toEqual([
      { baseUrl: baseUrl("kilometre"), conversions: {} },
    ]);
  });

  it("severs a composed member whose edge another member stores", () => {
    const hubStored = {
      [baseUrl("second")]: makeDataType("Second", {
        [baseUrl("minute")]: multiply(1 / 60),
        [baseUrl("hour")]: multiply(1 / 3600),
      }),
      [baseUrl("minute")]: makeDataType("Minute"),
      [baseUrl("hour")]: makeDataType("Hour"),
    };
    const hubGroups = buildConversionGroups(hubStored);
    const initialRows = conversionRowsForViewer({
      viewedBaseUrl: baseUrl("minute"),
      group: hubGroups.get(baseUrl("minute"))!,
    }).filter((row) => !row.viaCanonical);

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("minute"),
      desiredRows: initialRows.map((row) => ({
        targetBaseUrl: row.targetBaseUrl,
        factor: row.factor!,
      })),
      initialRows,
      removedComposedTargets: [baseUrl("hour")],
      latestDataTypes: hubStored,
      canWriteTo: () => true,
    });

    expect(plan.unremovableTargets).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.baseUrl).toBe(baseUrl("second"));
    expect(Object.keys(plan.updates[0]!.conversions)).toEqual([
      baseUrl("minute"),
    ]);
  });

  it("reports a severing the caller can't write", () => {
    const directRows = directRowsFor(baseUrl("centimetre"));

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("centimetre"),
      desiredRows: directRows.map((row) => ({
        targetBaseUrl: row.targetBaseUrl,
        factor: row.factor!,
      })),
      initialRows: directRows,
      removedComposedTargets: [baseUrl("kilometre")],
      latestDataTypes: lengthTypes,
      canWriteTo: (writeBaseUrl) => writeBaseUrl !== baseUrl("kilometre"),
    });

    expect(plan.unremovableTargets).toEqual([baseUrl("kilometre")]);
    expect(plan.updates).toEqual([]);
  });

  it("frees a severed member for a fresh pairing in the same plan", () => {
    const directRows = directRowsFor(baseUrl("centimetre"));

    const plan = planConversionUpdates({
      viewedBaseUrl: baseUrl("centimetre"),
      desiredRows: [
        ...directRows.map((row) => ({
          targetBaseUrl: row.targetBaseUrl,
          factor: row.factor!,
        })),
        // 1 centimetre = 0.00002 kilometres replaces the composed 0.00001
        { targetBaseUrl: baseUrl("kilometre"), factor: 0.00002 },
      ],
      initialRows: directRows,
      removedComposedTargets: [baseUrl("kilometre")],
      latestDataTypes: lengthTypes,
      canWriteTo: () => true,
    });

    expect(plan.unplacedTargets).toEqual([]);
    expect(plan.unremovableTargets).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]!.baseUrl).toBe(baseUrl("kilometre"));
    // Stored against the pair's hub, metre: 1 km = 50,000 cm = 500 m
    expect(
      parseConversionFactor(plan.updates[0]!.conversions[baseUrl("metre")]!),
    ).toBeCloseTo(500);
  });

  describe("never pairs through a hub elected by other users' entries", () => {
    /** An unrelated user's type storing an entry aimed at the victim's A */
    const withForeignEntry = {
      [baseUrl("a")]: makeDataType("A"),
      [baseUrl("x")]: makeDataType("X", { [baseUrl("a")]: multiply(2) }),
      [baseUrl("n")]: makeDataType("N"),
    };
    const isForeign = (writeBaseUrl: BaseUrl) => writeBaseUrl === baseUrl("x");

    it("stores a new pairing with A directly, not through X", () => {
      const plan = planConversionUpdates({
        viewedBaseUrl: baseUrl("n"),
        desiredRows: [{ targetBaseUrl: baseUrl("a"), factor: 3 }],
        initialRows: [],
        latestDataTypes: withForeignEntry,
        canWriteTo: (writeBaseUrl) => !isForeign(writeBaseUrl),
      });

      expect(plan.unplacedTargets).toEqual([]);
      expect(plan.updates).toEqual([
        {
          baseUrl: baseUrl("n"),
          conversions: { [baseUrl("a")]: multiply(3) },
        },
      ]);
    });

    it("stores a target joining A's group against A, not X", () => {
      const plan = planConversionUpdates({
        viewedBaseUrl: baseUrl("a"),
        desiredRows: [{ targetBaseUrl: baseUrl("n"), factor: 0.5 }],
        initialRows: [],
        latestDataTypes: withForeignEntry,
        canWriteTo: (writeBaseUrl) => !isForeign(writeBaseUrl),
      });

      expect(plan.unplacedTargets).toEqual([]);
      expect(plan.updates).toHaveLength(1);
      expect(plan.updates[0]!.baseUrl).toBe(baseUrl("n"));
      expect(Object.keys(plan.updates[0]!.conversions)).toEqual([baseUrl("a")]);
      // 1 a = 0.5 n ⇒ 1 n = 2 a
      expect(
        parseConversionFactor(plan.updates[0]!.conversions[baseUrl("a")]!),
      ).toBeCloseTo(2);
    });

    it("refuses a pairing when inflating X's connectivity makes it the hub", () => {
      const inflated = {
        ...withForeignEntry,
        [baseUrl("y1")]: makeDataType("Y1", { [baseUrl("x")]: multiply(5) }),
        [baseUrl("y2")]: makeDataType("Y2", { [baseUrl("x")]: multiply(7) }),
      };

      const plan = planConversionUpdates({
        viewedBaseUrl: baseUrl("n"),
        desiredRows: [{ targetBaseUrl: baseUrl("a"), factor: 3 }],
        initialRows: [],
        latestDataTypes: inflated,
        canWriteTo: (writeBaseUrl) => writeBaseUrl === baseUrl("n"),
      });

      // A never chose X, so the pairing is refused rather than stored
      // through it
      expect(plan.unplacedTargets).toEqual([baseUrl("a")]);
      expect(plan.updates).toEqual([]);
    });

    it("refuses a target joining A's group when X is its hub", () => {
      const inflated = {
        ...withForeignEntry,
        [baseUrl("y1")]: makeDataType("Y1", { [baseUrl("x")]: multiply(5) }),
        [baseUrl("y2")]: makeDataType("Y2", { [baseUrl("x")]: multiply(7) }),
      };

      const plan = planConversionUpdates({
        viewedBaseUrl: baseUrl("a"),
        desiredRows: [{ targetBaseUrl: baseUrl("n"), factor: 0.5 }],
        initialRows: [],
        latestDataTypes: inflated,
        canWriteTo: (writeBaseUrl) =>
          writeBaseUrl === baseUrl("n") || writeBaseUrl === baseUrl("a"),
      });

      expect(plan.unplacedTargets).toEqual([baseUrl("n")]);
      expect(plan.updates).toEqual([]);
    });
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

describe("mergeConversionRecords", () => {
  const metre = baseUrl("metre");
  const foot = baseUrl("foot");
  const inch = baseUrl("inch");

  it("applies each record's changes against the current conversions", () => {
    const current = { [metre]: multiply(1000) };

    expect(
      mergeConversionRecords(current, [
        { [metre]: multiply(1000), [foot]: multiply(3) },
        { [metre]: multiply(1000), [inch]: multiply(12) },
      ]),
    ).toEqual({
      [metre]: multiply(1000),
      [foot]: multiply(3),
      [inch]: multiply(12),
    });
  });

  it("keeps a removal from one record when another leaves the entry as is", () => {
    expect(
      mergeConversionRecords({ [metre]: multiply(1000), [foot]: multiply(3) }, [
        { [foot]: multiply(3) },
        { [metre]: multiply(1000), [foot]: multiply(3), [inch]: multiply(12) },
      ]),
    ).toEqual({ [foot]: multiply(3), [inch]: multiply(12) });
  });

  it("accepts records that make the same change", () => {
    expect(
      mergeConversionRecords({}, [
        { [foot]: multiply(3) },
        { [foot]: multiply(3) },
      ]),
    ).toEqual({ [foot]: multiply(3) });
  });

  it("returns null when records change one entry differently", () => {
    expect(
      mergeConversionRecords({}, [
        { [foot]: multiply(3) },
        { [foot]: multiply(4) },
      ]),
    ).toBeNull();
  });
});

describe("severedConversionPairings", () => {
  it("pairs the severed member with every other member of a star", () => {
    const groups = buildConversionGroups(lengthTypes);

    const pairings = severedConversionPairings({
      memberBaseUrl: baseUrl("kilometre"),
      group: groups.get(baseUrl("kilometre"))!,
    });

    expect(pairings).toHaveLength(2);
    expect(pairings).toContainEqual([baseUrl("kilometre"), baseUrl("metre")]);
    expect(pairings).toContainEqual([
      baseUrl("kilometre"),
      baseUrl("centimetre"),
    ]);
  });

  it("includes pairings split apart by severing a cut member", () => {
    // A → B → C chain: severing B also cuts A off from C
    const chain = {
      [baseUrl("a")]: makeDataType("A", { [baseUrl("b")]: multiply(2) }),
      [baseUrl("b")]: makeDataType("B", { [baseUrl("c")]: multiply(3) }),
      [baseUrl("c")]: makeDataType("C"),
    };
    const groups = buildConversionGroups(chain);

    const pairings = severedConversionPairings({
      memberBaseUrl: baseUrl("b"),
      group: groups.get(baseUrl("b"))!,
    });

    expect(pairings).toHaveLength(3);
    expect(pairings).toContainEqual([baseUrl("b"), baseUrl("a")]);
    expect(pairings).toContainEqual([baseUrl("b"), baseUrl("c")]);
    expect(pairings).toContainEqual([baseUrl("a"), baseUrl("c")]);
  });
});

describe("conversionRowStatesFromRows", () => {
  it("keeps the stored single-step form, falling back to the factor", () => {
    const [minute, metre] = conversionRowStatesFromRows([
      {
        targetBaseUrl: baseUrl("minute"),
        factor: 1 / 60,
        simple: { operator: "/", operand: 60 },
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

    // "this = Minute ÷ 60" as stored / "this = Metre × 0.01" from the factor
    expect(minute).toMatchObject({ operator: "/", value: 60 });
    expect(metre).toMatchObject({ operator: "*", value: 0.01 });
  });
});

describe("parseSimpleConversion", () => {
  it("parses every single-step operator shape", () => {
    expect(
      parseSimpleConversion({
        to: { expression: ["+", "self", { const: 273.15, type: "number" }] },
        from: { expression: ["-", "self", { const: 273.15, type: "number" }] },
      }),
    ).toEqual({ operator: "+", operand: 273.15 });
    expect(parseSimpleConversion(multiply(60))).toEqual({
      operator: "*",
      operand: 60,
    });
    expect(
      parseSimpleConversion({
        to: {
          expression: [
            "*",
            "self",
            ["+", "self", { const: 1, type: "number" }],
          ],
        },
        from: { expression: ["/", "self", { const: 2, type: "number" }] },
      }),
    ).toBeNull();
  });

  it("accepts a commuted to-expression with a structural inverse from", () => {
    expect(
      parseSimpleConversion({
        to: { expression: ["*", { const: 2, type: "number" }, "self"] },
        from: { expression: ["/", "self", { const: 2, type: "number" }] },
      }),
    ).toEqual({ operator: "*", operand: 2 });
  });

  it("rejects a pair whose from does not undo its to", () => {
    // Reciprocal multiply: mathematically inverse, structurally not — a
    // symmetric rewrite would discard the stored form
    expect(
      parseSimpleConversion({
        to: { expression: ["*", "self", { const: 2, type: "number" }] },
        from: { expression: ["*", "self", { const: 0.5, type: "number" }] },
      }),
    ).toBeNull();
    // Inverse operator but a different constant
    expect(
      parseSimpleConversion({
        to: { expression: ["+", "self", { const: 10, type: "number" }] },
        from: { expression: ["-", "self", { const: 9, type: "number" }] },
      }),
    ).toBeNull();
    // Single-step to, compound from
    expect(
      parseSimpleConversion({
        to: { expression: ["*", "self", { const: 2, type: "number" }] },
        from: {
          expression: [
            "/",
            ["-", "self", { const: 0, type: "number" }],
            { const: 2, type: "number" },
          ],
        },
      }),
    ).toBeNull();
  });
});

describe("formatConversionExpression", () => {
  const constant = (value: number) => ({
    const: value,
    type: "number" as const,
  });

  it("prints a flat expression with self as the given label", () => {
    expect(
      formatConversionExpression(["-", constant(100), "self"], "Target"),
    ).toBe("100 − Target");
  });

  it("parenthesises a lower-precedence nested expression", () => {
    expect(
      formatConversionExpression(
        ["/", ["-", "self", constant(32)], constant(1.8)],
        "Fahrenheit",
      ),
    ).toBe("(Fahrenheit − 32) ÷ 1.8");
  });

  it("leaves a higher-precedence left operand unparenthesised", () => {
    expect(
      formatConversionExpression(
        ["+", ["*", "self", constant(1.8)], constant(32)],
        "Celsius",
      ),
    ).toBe("Celsius × 1.8 + 32");
  });

  it("parenthesises an equal-precedence right operand of - and /", () => {
    expect(
      formatConversionExpression(
        ["-", constant(100), ["-", "self", constant(1)]],
        "Value",
      ),
    ).toBe("100 − (Value − 1)");
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
