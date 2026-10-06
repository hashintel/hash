import { describe, expect, it } from "vitest";

import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import { demoConstraints } from "../../ui/controller-prototype/scheduler-example";
import {
  CONSTRAINTS_METADATA_KEY,
  applyPattern,
  contradictionIn,
  rulePatternOf,
  constraintCode,
  constraintCodeText,
  firstCheck,
  forEveryHint,
  mapConstraintChecks,
  newConstraint,
  parseSubjectValue,
  readConstraints,
  ruleDepth,
  subjectGroups,
  subjectRowText,
  subjectUnit,
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

  it("offers place tokens, token fields, metrics and events", () => {
    const groups = subjectGroups(net);
    expect(groups.map((group) => group.id)).toEqual([
      "tokens",
      "fields",
      "metrics",
      "events",
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
      "G (MachineDown > 0 → (F[0,2] (MachineUp > 0)))",
    );
  });

  it("writes a rule two levels down inside its parent", () => {
    expect(codeOf("recovery_keeps_orders_moving")).toBe(
      "G (MachineDown > 0 → (G (Backorders > 20 → (F[0,5] (OpenOrders < 10)))))",
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
      "G[1,9] (? < ? → (F[0,2] (MachineUp > 0)))",
    );
  });

  it("keeps the flat syntax for a rule with no nested rule", () => {
    expect(codeOf("backorders_under_20")).toBe(
      "G[30,360] (Backorders < 20)",
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
    ).toBe("G (? < 3 ∨ (F[0,2] (MachineUp > 0)))");
  });

  it("breaks the editable text after each arrow, and leaves flat rules alone", () => {
    expect(
      constraintCodeText(net, demo("recovery_keeps_orders_moving")),
    ).toBe(
      "G (MachineDown > 0 →\n  (G (Backorders > 20 →\n  (F[0,5] (OpenOrders < 10)))))",
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
      "G (? > 0 → (G (? > 20 → (F[0,5] (? < 10)))))",
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


describe("MTL code", () => {
  it("writes the window after the operator", () => {
    expect(codeOf("backorders_under_20")).toBe("G[30,360] (Backorders < 20)");
  });

  it("writes a token field as place.field and a metric by name", () => {
    expect(codeOf("machine_health_above_0_2")).toBe("G (MachineUp.health > 0.2)");
    expect(codeOf("scrap_under_5")).toBe("G (Scrapfraction < 0.05)");
  });

  it("writes never as always with the comparison flipped, and no NOT", () => {
    expect(codeOf("machine_health_above_0_2", { time: "never" })).toBe(
      "G (MachineUp.health ≤ 0.2)",
    );
  });

  it("writes the end of the run as F[T,T]", () => {
    expect(codeOf("scrap_under_5", { time: "atEnd" })).toBe(
      "F[T,T] (Scrapfraction < 0.05)",
    );
  });

  it("writes until, if ever, as W", () => {
    const rule = applyPattern(newConstraint("c", "C"), "precedence");
    expect(constraintCode(net, rule)).toBe("? ≤ 0 W ? > 0");
  });

  it("writes the response pattern with a window on the nested rule", () => {
    const rule = applyPattern(newConstraint("c", "C"), "response");
    expect(constraintCode(net, rule)).toBe("G (? > 0 → (F[0,2] (? > 0)))");
  });

  it("writes events as atoms with no comparison", () => {
    const transition = net.transitions[0]!;
    const rule: ModelConstraint = {
      ...newConstraint("c", "C"),
      time: "eventually",
      checks: [{ subject: { kind: "fires", id: transition.id }, op: "below", bound: null }],
    };
    expect(constraintCode(net, rule)).toMatch(/^F \(fired\(\w+\)\)$/);
  });
});

describe("patterns", () => {
  it("reads the pattern from the rule's shape", () => {
    const start = newConstraint("c", "C");
    for (const id of ["always", "never", "once", "response", "precedence"]) {
      expect(rulePatternOf(applyPattern(start, id))).toBe(id);
    }
    expect(rulePatternOf({ ...start, checks: [...start.checks, ...start.checks] })).toBe("custom");
  });

  it("keeps the chosen subject when switching patterns", () => {
    const subject: CheckSubject = { kind: "placeTokens", id: net.places[0]!.id };
    const start = { ...newConstraint("c", "C"), checks: [{ subject, op: "below" as const, bound: 20 }] };
    expect(applyPattern(start, "response").trigger?.subject).toEqual(subject);
    expect(applyPattern(start, "never").checks[0]).toMatchObject({ subject, bound: 20 });
  });
});

describe("contradictions", () => {
  const subject: CheckSubject = { kind: "placeTokens", id: "p" };
  it("finds conditions joined by and that no value meets", () => {
    expect(
      contradictionIn(
        [
          { subject, op: "below", bound: 10 },
          { subject, op: "above", bound: 20 },
        ],
        "all",
      ),
    ).toBe(true);
    expect(
      contradictionIn(
        [
          { subject, op: "atMost", bound: 10 },
          { subject, op: "atLeast", bound: 10 },
        ],
        "all",
      ),
    ).toBe(false);
    expect(
      contradictionIn(
        [
          { subject, op: "below", bound: 10 },
          { subject, op: "above", bound: 20 },
        ],
        "any",
      ),
    ).toBe(false);
  });
});
