import { describe, expect, it } from "vitest";

import { foldHir } from "../../hir/analyze";
import { lowerTypeScriptToHir } from "../../hir/lower-typescript";
import { lowerPetriNetIr } from "../lower-petri-net-ir";
import { birthDeathIr } from "../shared/birth-death.fixtures";
import { forkClockedIr } from "../shared/fork.fixtures";

import type { PetriNetIr } from "../petri-net-ir";
import type { SpnModuleGraph } from "../spn-module-graph";
import type { CodeParser } from "./step-plan";

const parseCode: CodeParser = (code, surface) => {
  const lowered = lowerTypeScriptToHir(code, surface);
  return lowered.ok
    ? { ...lowered.fn, body: foldHir(lowered.fn.body) }
    : undefined;
};

const lowerClocks = (ir: PetriNetIr) => {
  const outcome = lowerPetriNetIr(ir);
  if (!outcome.ok) {
    throw new Error(outcome.errors.map((error) => error.code).join(", "));
  }
  if (outcome.graph.language !== "spn") {
    throw new Error("expected an SPN graph");
  }
  return { graph: outcome.graph, warnings: outcome.warnings };
};

describe("lowerClocks", () => {
  const { graph } = lowerClocks(birthDeathIr);

  it("gives each transition a clock and an event, each place a count, and hides the clocks", () => {
    expect(
      graph.variables.map((variable) => [
        variable.name,
        variable.sort,
        variable.role,
      ]),
    ).toEqual([
      ["t", "clock", "time"],
      ["Population", "nat", "place"],
      ["clk_Birth", "clock", "clock"],
      ["clk_Death", "clock", "clock"],
      ["ev_Birth", "event", "event"],
      ["ev_Death", "event", "event"],
    ]);
    expect(graph.hidden).toEqual(["clk_Birth", "clk_Death"]);
    expect(
      graph.modules.map((module) => [
        module.className,
        module.ctrl,
        module.extl,
        module.flow === undefined ? "no flow" : "flow",
      ]),
    ).toEqual([
      ["Transition_Birth", ["clk_Birth", "ev_Birth"], ["t"], "flow"],
      [
        "Transition_Death",
        ["clk_Death", "ev_Death"],
        ["Population", "t"],
        "flow",
      ],
      ["Place_Population", ["Population"], ["ev_Birth", "ev_Death"], "no flow"],
    ]);
  });

  it("ignores the shape, marking, control and dt flags, warning about an open control", () => {
    const busy = lowerClocks({
      ...birthDeathIr,
      transitions: {
        ...birthDeathIr.transitions,
        Death: { ...birthDeathIr.transitions.Death, controllable: true },
      },
      zeroth: {
        rates: "clock",
        shape: "monolithic",
        marking: "int",
        control: "open",
        dt: 0.25,
      },
    });
    const plain: SpnModuleGraph = lowerClocks({
      ...birthDeathIr,
      transitions: {
        ...birthDeathIr.transitions,
        Death: { ...birthDeathIr.transitions.Death, controllable: true },
      },
    }).graph;
    expect(busy.graph).toEqual(plain);
    expect(busy.warnings.map((warning) => warning.code)).toEqual([
      "control-open-clocks",
    ]);
  });

  it("gives each transition in a conflict a Bool pick it reads at the expiry, left in the interface", () => {
    const { graph: open } = lowerClocks(forkClockedIr);
    expect(
      open.variables
        .filter((variable) => variable.role === "pick")
        .map((variable) => [variable.name, variable.sort, variable.comment]),
    ).toEqual([
      ["pick_TakeLeft", "bool", "the environment lets TakeLeft fire this step"],
      [
        "pick_TakeRight",
        "bool",
        "the environment lets TakeRight fire this step",
      ],
    ]);
    expect(open.hidden).toEqual([
      "clk_TakeLeft",
      "clk_TakeRight",
      "clk_Return",
    ]);
    expect(
      open.modules.map((module) => [module.className, module.extl]),
    ).toEqual([
      ["Transition_TakeLeft", ["Pool", "pick_TakeLeft", "t"]],
      ["Transition_TakeRight", ["Pool", "pick_TakeRight", "t"]],
      ["Transition_Return", ["Left", "t"]],
      ["Place_Pool", ["ev_Return", "ev_TakeLeft", "ev_TakeRight"]],
      ["Place_Left", ["ev_TakeLeft", "ev_Return"]],
      ["Place_Right", ["ev_TakeRight"]],
    ]);
    expect(open.modules[0]?.next).toEqual([
      {
        kind: "assign",
        target: "fires_TakeLeft",
        expr: {
          kind: "logic",
          op: "&",
          left: {
            kind: "logic",
            op: "&",
            left: {
              kind: "test",
              operand: { kind: "ref", name: "clk_TakeLeft" },
              zero: true,
            },
            right: {
              kind: "test",
              operand: { kind: "ref", name: "Pool" },
              zero: false,
            },
          },
          right: { kind: "ref", name: "pick_TakeLeft" },
        },
      },
    ]);
    // The pick is read at the expiry alone: the clock runs on the arcs.
    expect(open.modules[0]?.flow).toEqual(
      lowerClocks({ ...forkClockedIr, zeroth: { rates: "clock" } }).graph
        .modules[0]?.flow,
    );
  });

  it("refuses a rate that reads its tokens by name alone, parser or not", () => {
    const coded: PetriNetIr = {
      ...birthDeathIr,
      transitions: {
        ...birthDeathIr.transitions,
        Death: {
          inputs: { Population: null },
          rate: "return input.Population.length;",
        },
      },
    };
    for (const options of [{}, { parseCode }]) {
      const outcome = lowerPetriNetIr(coded, options);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errors.map((error) => error.code)).toEqual([
          "clocks-rate-code",
        ]);
      }
    }
  });
});
