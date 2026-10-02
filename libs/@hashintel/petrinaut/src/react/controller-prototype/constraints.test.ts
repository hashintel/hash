import { describe, expect, it } from "vitest";

import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import { demoConstraints } from "../../ui/controller-prototype/scheduler-example";
import {
  CONSTRAINTS_METADATA_KEY,
  constraintCode,
  forEveryHint,
  newConstraint,
  parseSubjectValue,
  readConstraints,
  subjectGroups,
  subjectRowText,
  subjectUnit,
  constraintModeHint,
  constraintModeNote,
  subjectValue,
  writeConstraints,
} from "./constraints";

import type { ModelConstraint } from "./constraints";
import type { SDCPN } from "@hashintel/petrinaut-core";

const net = supplyChainWithDisruption.petriNetDefinition;

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

  it("marks the second condition of until and release as unset", () => {
    expect(codeOf("machine_health_above_0_2", { time: "until" })).toBe(
      "until(MachineUp.health > 0.2, ?)",
    );
    expect(codeOf("machine_health_above_0_2", { time: "release" })).toBe(
      "release(?, MachineUp.health > 0.2)",
    );
  });

  it("marks an unset slot with a question mark", () => {
    expect(constraintCode(net, newConstraint("c", "Constraint 1"))).toBe(
      "always(? < ?)",
    );
  });

  it("joins checks and wraps a trigger", () => {
    const base = demoConstraints[0]!;
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
      for (const { subject } of constraint.checks) {
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
    expect(subjectUnit(net, demoConstraints[3]!.checks[0]!.subject)).toBe("days");
    expect(subjectUnit(net, demoConstraints[1]!.checks[0]!.subject)).toBeNull();
    expect(subjectUnit(net, demoConstraints[0]!.checks[0]!.subject)).toBe("tokens");
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
    const groups = subjectGroups(net, demoConstraints[3]!.forEvery);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.text)).toEqual([
      "age",
      "priority",
      "promised_lead_time",
    ]);
  });
});
