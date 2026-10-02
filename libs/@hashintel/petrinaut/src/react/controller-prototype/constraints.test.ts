import { describe, expect, it } from "vitest";

import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import { demoConstraints } from "../../ui/controller-prototype/scheduler-example";
import {
  CONSTRAINTS_METADATA_KEY,
  applyPreset,
  constraintCode,
  constraintCodeText,
  firstCheck,
  forEveryHint,
  mapConstraintChecks,
  newConstraint,
  parseSubjectValue,
  readConstraints,
  ruleDepth,
  rulePresets,
  subjectGroups,
  subjectRowText,
  subjectUnit,
  constraintModeHint,
  constraintModeNote,
  subjectValue,
  writeConstraints,
} from "./constraints";

import type { CheckSubject, ModelConstraint } from "./constraints";
import type { SDCPN } from "@hashintel/petrinaut-core";

const net = supplyChainWithDisruption.petriNetDefinition;

const demo = (id: string) =>
  demoConstraints.find((candidate) => candidate.id === id)!;

const codeOf = (id: string, change?: Partial<ModelConstraint>) => {
  const constraint = demoConstraints.find((candidate) => candidate.id === id)!;
  return constraintCode(net, { ...constraint, ...change });
};

describe("constraintCode", () => {
  it("writes the window before the condition", () => {
    expect(codeOf("backorders_under_20")).toBe(
      "always(30, 360, Backorders.count < 20)",
    );
  });

  it("writes a token field as place.field", () => {
    expect(codeOf("machine_health_above_0_2")).toBe(
      "always(MachineUp.health > 0.2)",
    );
  });

  it("writes a model metric by name", () => {
    expect(codeOf("scrap_under_5")).toBe(
      'always(metric("Scrap fraction") < 0.05)',
    );
  });

  it("writes a for-every around the rule", () => {
    expect(codeOf("order_wait_under_14_days")).toBe(
      'forEvery(["OpenOrders", "Backorders"], (order) => always(order.age < 14))',
    );
  });

  it("starts a within window at 0", () => {
    expect(
      codeOf("backorders_under_20", { window: { kind: "within", to: 14 } }),
    ).toBe("always(0, 14, Backorders.count < 20)");
  });

  it("uses the chosen time word", () => {
    expect(codeOf("machine_health_above_0_2", { time: "eventually" })).toBe(
      "eventually(MachineUp.health > 0.2)",
    );
  });

  it("writes until as two operands around the word", () => {
    expect(codeOf("backorders_until_supplier_b")).toBe(
      "Backorders < 20 until SupplierBAvailable > 0",
    );
    expect(
      codeOf("backorders_until_supplier_b", { time: "release" }),
    ).toBe("Backorders < 20 release SupplierBAvailable > 0");
  });

  it("marks an empty second slot of until with question marks", () => {
    expect(codeOf("machine_health_above_0_2", { time: "until" })).toBe(
      "MachineUp.health > 0.2 until ? < ?",
    );
  });

  it("writes the window after the word and joins each operand", () => {
    const extra = {
      subject: { kind: "placeTokens" as const, id: "place_orders" },
      op: "below" as const,
      bound: 50,
    };
    const base = demo("backorders_until_supplier_b");
    expect(
      constraintCode(net, {
        ...base,
        window: { kind: "between", from: 30, to: 360 },
        second: [...base.second!, extra],
        secondJoin: "any",
      }),
    ).toBe(
      "Backorders < 20 until_[30 days,360 days] (SupplierBAvailable > 0 || OpenOrders < 50)",
    );
    expect(
      constraintCode(net, {
        ...base,
        window: { kind: "within", to: 14 },
        checks: [...base.checks, extra],
      }),
    ).toBe(
      "(Backorders < 20 && OpenOrders < 50) until_[0 days,14 days] SupplierBAvailable > 0",
    );
  });

  it("keeps a hidden second slot out of the line under always", () => {
    expect(
      codeOf("backorders_until_supplier_b", { time: "always" }),
    ).toBe("always(Backorders.count < 20)");
  });

  it("keeps the for-every around until", () => {
    expect(
      codeOf("order_wait_under_14_days", {
        time: "until",
        second: [{ subject: null, op: "above", bound: 0 }],
      }),
    ).toBe(
      'forEvery(["OpenOrders", "Backorders"], (order) => order.age < 14 until ? > 0)',
    );
  });

  it("marks an unset slot with a question mark", () => {
    expect(constraintCode(net, newConstraint("c", "Constraint 1"))).toBe(
      "always(? < ?)",
    );
  });

  it("joins checks and wraps a trigger", () => {
    const base = demo("backorders_under_20");
    const second = {
      subject: { kind: "placeTokens" as const, id: "place_orders" },
      op: "below" as const,
      bound: 50,
    };
    expect(
      constraintCode(net, {
        ...base,
        window: undefined,
        checks: [...base.checks, second],
        join: "any",
      }),
    ).toBe("always(Backorders.count < 20 || OpenOrders.count < 50)");
    expect(
      constraintCode(net, {
        ...base,
        window: undefined,
        checks: [...base.checks, second],
        trigger: { subject: null, op: "above", bound: null },
      }),
    ).toBe(
      "always(implies(? > ?, Backorders.count < 20 && OpenOrders.count < 50))",
    );
  });
});

describe("demo constraints", () => {
  it("point at ids that exist in the net", () => {
    const placeIds = new Set(net.places.map(({ id }) => id));
    const metricIds = new Set((net.metrics ?? []).map(({ id }) => id));
    for (const constraint of demoConstraints) {
      for (const placeId of constraint.forEvery?.placeIds ?? []) {
        expect(placeIds.has(placeId)).toBe(true);
      }
      const subjects: (CheckSubject | null)[] = [];
      mapConstraintChecks(constraint, (check) => {
        subjects.push(check.subject);
        return check;
      });
      for (const subject of subjects) {
        expect(subject).not.toBeNull();
        if (subject?.kind === "metric") {
          expect(metricIds.has(subject.id)).toBe(true);
        }
        if (subject?.kind === "placeTokens") {
          expect(placeIds.has(subject.id)).toBe(true);
        }
      }
    }
  });
});

describe("read and write", () => {
  it("round-trips constraints through the net metadata", () => {
    const draft: SDCPN = { ...net, metadata: undefined };
    writeConstraints(draft, demoConstraints);
    expect(readConstraints(draft)).toEqual(demoConstraints);
  });

  it("drops entries that do not parse and fills defaults", () => {
    const sdcpn: SDCPN = {
      ...net,
      metadata: {
        [CONSTRAINTS_METADATA_KEY]: [
          { id: "ok", name: "Fine" },
          { id: 4, name: "Bad id" },
          "junk",
        ],
      },
    };
    expect(readConstraints(sdcpn)).toEqual([
      {
        id: "ok",
        name: "Fine",
        time: "always",
        checks: [{ subject: null, op: "below", bound: null }],
        tolerance: 95,
        mode: "monitored",
      },
    ]);
  });

  it("reads the second slot and drops one that does not parse", () => {
    const sdcpn: SDCPN = {
      ...net,
      metadata: {
        [CONSTRAINTS_METADATA_KEY]: [
          {
            id: "u",
            name: "Until",
            time: "until",
            second: [{ subject: null, op: "above", bound: 0 }, "junk"],
            secondJoin: "any",
          },
          { id: "v", name: "Bad", second: "junk", secondJoin: "some" },
        ],
      },
    };
    const [until, bad] = readConstraints(sdcpn);
    expect(until?.second).toEqual([{ subject: null, op: "above", bound: 0 }]);
    expect(until?.secondJoin).toBe("any");
    expect(bad).not.toHaveProperty("second");
    expect(bad).not.toHaveProperty("secondJoin");
  });

  it("reads nothing from a net without constraints", () => {
    expect(readConstraints(net)).toEqual([]);
  });
});

describe("for every", () => {
  it("names the token type in the hint", () => {
    expect(forEveryHint("Customer order")).toContain(
      "Tracks one customer order across firings",
    );
  });

  it("reads an age field as days, place tokens as tokens, and nothing else", () => {
    expect(subjectUnit(net, firstCheck(demo("order_wait_under_14_days").checks)!.subject)).toBe("days");
    expect(subjectUnit(net, firstCheck(demo("machine_health_above_0_2").checks)!.subject)).toBeNull();
    expect(subjectUnit(net, firstCheck(demo("backorders_under_20").checks)!.subject)).toBe("tokens");
    expect(subjectUnit(net, { kind: "metric", id: "scrap" })).toBeNull();
    expect(subjectUnit(net, null)).toBeNull();
  });
});

describe("mode notes", () => {
  it("says what a failing run does for monitored and stop-early", () => {
    expect(constraintModeNote.monitored).toContain("still finishes");
    expect(constraintModeNote.stopEarly).toContain("stops early");
  });

  it("reuses the hover text for the enforced modes", () => {
    expect(constraintModeNote.enforcedSoft).toBe(constraintModeHint.enforcedSoft);
    expect(constraintModeNote.enforcedHard).toBe(constraintModeHint.enforcedHard);
  });
});

describe("subjects", () => {
  it("round-trips a subject through its select value", () => {
    for (const subject of [
      { kind: "placeTokens" as const, id: "place_backorders" },
      { kind: "metric" as const, id: "metric_scrap_rate" },
      { kind: "tokenField" as const, id: "place_machine_up", field: "machine_health" },
    ]) {
      expect(parseSubjectValue(subjectValue(subject))).toEqual(subject);
    }
  });

  it("offers place tokens, token fields and metrics", () => {
    const groups = subjectGroups(net);
    expect(groups.map((group) => group.id)).toEqual([
      "tokens",
      "fields",
      "metrics",
    ]);
    expect(
      groups
        .find((group) => group.id === "fields")
        ?.items.some((item) => item.text === "MachineUp · health"),
    ).toBe(true);
  });

  it("drops the tab's own word from a row's text", () => {
    expect(subjectRowText("tokens", "Backorders · tokens")).toBe("Backorders");
    expect(subjectRowText("fields", "MachineUp · health")).toBe(
      "MachineUp · health",
    );
    expect(subjectRowText("metrics", "Scrap")).toBe("Scrap");
  });

  it("offers only the token type's fields under a for-every", () => {
    const groups = subjectGroups(net, demo("order_wait_under_14_days").forEvery);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.text)).toEqual([
      "age",
      "priority",
      "promised_lead_time",
    ]);
  });
});

describe("nested rules", () => {
  it("writes a nested rule after the trigger, as in the frame", () => {
    expect(codeOf("machines_back_within_2_days")).toBe(
      "always (MachineDown --> eventually_[0 days,2 days] MachineUp)",
    );
  });

  it("writes a rule two levels down inside its parent", () => {
    expect(codeOf("recovery_keeps_orders_moving")).toBe(
      "always (MachineDown --> always (Backorders > 20 --> eventually_[0 days,5 days] OpenOrders < 10))",
    );
  });

  it("writes a check that is not 'above 0' as a comparison on the bare name", () => {
    const base = demo("machines_back_within_2_days");
    expect(
      constraintCode(net, {
        ...base,
        trigger: { subject: null, op: "below", bound: null },
        window: { kind: "between", from: 1, to: 9 },
      }),
    ).toBe(
      "always_[1 days,9 days] (? < ? --> eventually_[0 days,2 days] MachineUp)",
    );
  });

  it("keeps the flat syntax for a rule with no nested rule", () => {
    expect(codeOf("backorders_under_20")).toBe(
      "always(30, 360, Backorders.count < 20)",
    );
  });

  it("wraps a nested rule that sits beside another check", () => {
    const base = demo("machines_back_within_2_days");
    expect(
      constraintCode(net, {
        ...base,
        trigger: undefined,
        checks: [
          { subject: null, op: "below", bound: 3 },
          ...base.checks,
        ],
        join: "any",
      }),
    ).toBe("always (? < 3 || (eventually_[0 days,2 days] MachineUp))");
  });

  it("breaks the editable text after each arrow, and leaves flat rules alone", () => {
    expect(
      constraintCodeText(net, demo("recovery_keeps_orders_moving")),
    ).toBe(
      "always (MachineDown -->\n  always (Backorders > 20 -->\n  eventually_[0 days,5 days] OpenOrders < 10))",
    );
    expect(constraintCodeText(net, demo("backorders_under_20"))).toBe(
      constraintCode(net, demo("backorders_under_20")),
    );
  });

  it("counts the levels of a rule", () => {
    expect(ruleDepth(demo("backorders_under_20"))).toBe(1);
    expect(ruleDepth(demo("backorders_until_supplier_b"))).toBe(1);
    expect(ruleDepth(demo("machines_back_within_2_days"))).toBe(2);
    expect(ruleDepth(demo("recovery_keeps_orders_moving"))).toBe(3);
  });

  it("counts a nested rule in the second slot", () => {
    const base = demo("backorders_until_supplier_b");
    expect(
      ruleDepth({
        ...base,
        second: [{ kind: "rule", time: "eventually", checks: base.second! }],
      }),
    ).toBe(2);
  });

  it("finds the first plain check, going into a nested rule", () => {
    const nested = demo("machines_back_within_2_days");
    expect(firstCheck(nested.checks)).toEqual({
      subject: { kind: "placeTokens", id: "place_machine_up" },
      op: "above",
      bound: 0,
    });
    expect(firstCheck(demo("backorders_under_20").checks)?.bound).toBe(20);
  });

  it("clears the subjects at every depth", () => {
    const cleared = mapConstraintChecks(
      demo("recovery_keeps_orders_moving"),
      (check) => ({ ...check, subject: null }),
    );
    expect(codeOf("recovery_keeps_orders_moving")).not.toContain("?");
    expect(constraintCode(net, cleared)).toBe(
      "always (? > 0 --> always (? > 20 --> eventually_[0 days,5 days] ? < 10))",
    );
  });

  it("reads a nested rule at any depth, and old data unchanged", () => {
    const draft = structuredClone(net);
    writeConstraints(draft, demoConstraints);
    expect(readConstraints(draft)).toEqual(demoConstraints);
    expect(
      ruleDepth(
        readConstraints(draft).find(
          ({ id }) => id === "recovery_keeps_orders_moving",
        )!,
      ),
    ).toBe(3);
  });

  it("gives a nested rule with no checks one empty check", () => {
    const draft = structuredClone(net);
    draft.metadata = {
      [CONSTRAINTS_METADATA_KEY]: [
        {
          id: "x",
          name: "X",
          checks: [{ kind: "rule", time: "eventually", checks: [] }],
        },
      ],
    };
    expect(readConstraints(draft)[0]?.checks).toEqual([
      {
        kind: "rule",
        time: "eventually",
        checks: [{ subject: null, op: "below", bound: null }],
      },
    ]);
  });
});

describe("presets", () => {
  const start = newConstraint("c", "Constraint 1");
  const shape = (id: string) => applyPreset(start, id);

  it("lists the six presets, Blank first", () => {
    expect(rulePresets.map(({ id }) => id)).toEqual([
      "blank",
      "always",
      "never",
      "once",
      "response",
      "precedence",
    ]);
  });

  it("starts Blank, Always and Never as one empty check under always", () => {
    for (const id of ["blank", "always", "never"]) {
      expect(shape(id)).toMatchObject({
        time: "always",
        preset: id,
        checks: [{ subject: null, op: "below", bound: null }],
      });
    }
  });

  it("starts 'at least once' as one empty check under eventually", () => {
    expect(shape("once")).toMatchObject({ time: "eventually" });
    expect(constraintCode(net, shape("once"))).toBe("eventually(? < ?)");
  });

  it("starts the response preset as a trigger with a nested rule", () => {
    expect(ruleDepth(shape("response"))).toBe(2);
    expect(constraintCode(net, shape("response"))).toBe(
      "always (? > 0 --> eventually_[0 days,2 days] ? > 0)",
    );
  });

  it("starts precedence as no Y until X", () => {
    expect(constraintCode(net, shape("precedence"))).toBe(
      "? < 1 until ? > 0",
    );
  });

  it("replaces the rule and keeps the name, scope, tolerance and mode", () => {
    const filled: ModelConstraint = {
      ...demo("order_wait_under_14_days"),
      window: { kind: "within", to: 3 },
      code: "custom",
      mode: "stopEarly",
    };
    const next = applyPreset(filled, "once");
    expect(next).toMatchObject({
      id: filled.id,
      name: filled.name,
      forEvery: filled.forEvery,
      tolerance: filled.tolerance,
      mode: "stopEarly",
    });
    expect(next.window).toBeUndefined();
    expect(next.code).toBeUndefined();
    expect(next.checks).toEqual([{ subject: null, op: "below", bound: null }]);
  });
});
