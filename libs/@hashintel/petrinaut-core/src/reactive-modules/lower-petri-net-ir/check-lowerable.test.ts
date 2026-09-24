import { describe, expect, it } from "vitest";

import { type PetriNetIr, resolveZerothTarget } from "../petri-net-ir";
import { birthDeathIr } from "../shared/birth-death.fixtures";
import { checkLowerable } from "./check-lowerable";

const clocks = resolveZerothTarget({ rates: "clock" });

const refusals = (ir: PetriNetIr) =>
  checkLowerable(ir, clocks).map(({ code, item }) => ({
    code,
    item: { kind: item.kind, name: item.name },
  }));

describe("checkLowerable under clock rates", () => {
  it("accepts the birth-death net", () => {
    expect(refusals(birthDeathIr)).toEqual([]);
  });

  it("refuses a transition without a rate, a rate that reads its tokens and one that is not positive", () => {
    expect(
      refusals({
        ...birthDeathIr,
        kind: "mixed",
        transitions: {
          Birth: { outputs: { Population: null } },
          Death: {
            inputs: { Population: null },
            rate: "return input.Population.length;",
          },
          Plague: { inputs: { Population: null }, rate: 0 },
        },
      }),
    ).toEqual([
      {
        code: "clocks-plain-transition",
        item: { kind: "transition", name: "Birth" },
      },
      { code: "clocks-rate-code", item: { kind: "transition", name: "Death" } },
      {
        code: "clocks-rate-not-positive",
        item: { kind: "transition", name: "Plague" },
      },
    ]);
  });

  it("refuses arcs that carry more than one token, naming each one", () => {
    const errors = checkLowerable(
      {
        ...birthDeathIr,
        places: { Population: null, Pairs: null },
        transitions: {
          Pair: {
            inputs: { Population: { weight: 2 } },
            outputs: { Pairs: null, Population: { weight: 3 } },
            rate: 1,
          },
        },
      },
      clocks,
    );
    expect(errors).toEqual([
      {
        code: "clocks-arc-weight",
        message:
          "the clocks strategy moves one token per arc; the arc from Population carries 2, the arc into Population carries 3",
        item: { kind: "transition", id: "Pair", name: "Pair" },
      },
    ]);
  });

  it("refuses a capacity, a colour, dynamics and a marking that is not a count", () => {
    expect(
      refusals({
        ...birthDeathIr,
        colours: { Person: { age: "real" } },
        dynamics: {
          Age: {
            colour: "Person",
            code: "return tokens.map(() => ({ age: 1 }));",
          },
        },
        places: {
          Population: { capacity: 10 },
          People: { colour: "Person", dynamics: "Age" },
          Debt: null,
        },
        marking: { Debt: -1 },
      }),
    ).toEqual([
      { code: "clocks-capacity", item: { kind: "place", name: "Population" } },
      { code: "clocks-coloured", item: { kind: "place", name: "People" } },
      { code: "clocks-dynamics", item: { kind: "place", name: "People" } },
      { code: "clocks-marking", item: { kind: "place", name: "Debt" } },
    ]);
  });

  it("does not also refuse a coloured net for the modular shape", () => {
    const coloured: PetriNetIr = {
      ...birthDeathIr,
      colours: { Person: { age: "real" } },
      places: { Population: { colour: "Person" } },
    };
    expect(
      checkLowerable(
        coloured,
        resolveZerothTarget({ rates: "clock", shape: "modular" }),
      ).map((error) => error.code),
    ).toEqual(["clocks-coloured"]);
    expect(
      checkLowerable(coloured, resolveZerothTarget({ shape: "modular" })).map(
        (error) => error.code,
      ),
    ).toEqual(["modular-coloured-not-lowered"]);
  });
});
