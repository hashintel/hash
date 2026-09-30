import { describe, expect, it } from "vitest";

import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import { addLevers, holdsAll, leverOptionsFor } from "./lever-options";

const net = supplyChainWithDisruption.petriNetDefinition;
const labels = (targetIds: string[]) =>
  leverOptionsFor(net, targetIds).map((option) => option.label);

describe("leverOptionsFor", () => {
  it("offers Initial tokens for a place", () => {
    expect(labels(["place_raw_materials"])).toEqual(["Initial tokens"]);
  });

  it("offers Choice and Rate for two transitions that compete at one place", () => {
    expect(
      labels(["trans_start_production", "trans_preventive_maintenance"]),
    ).toEqual(["Choice at MachineUp", "Rate"]);
  });

  it("offers Token field with the output token's fields for a single transition", () => {
    const options = leverOptionsFor(net, ["trans_convert_to_backorder"]);
    expect(options.map((option) => option.label)).toEqual([
      "Choice at OpenOrders",
      "Rate",
      "Token field",
    ]);
    const tokenField = options.find((option) => "fields" in option);
    expect(
      tokenField && "fields" in tokenField
        ? tokenField.fields.map((field) => field.fieldName)
        : [],
    ).toEqual(["age", "priority", "promised_lead_time"]);
  });

  it("offers nothing for a mix of places and transitions", () => {
    expect(labels(["place_raw_materials", "trans_start_production"])).toEqual(
      [],
    );
  });
});

describe("addLevers", () => {
  it("merges transitions into an existing Choice and skips held levers", () => {
    let counter = 0;
    const makeId = () => `lever_${counter++}`;
    const start = addLevers(
      { id: "c", name: "C", levers: [] },
      [
        {
          kind: "choice",
          placeId: "place_machine_up",
          transitionIds: ["trans_start_production"],
        },
        { kind: "rate", transitionId: "trans_order_supplier_a" },
      ],
      makeId,
    );
    const next = addLevers(
      start,
      [
        {
          kind: "choice",
          placeId: "place_machine_up",
          transitionIds: ["trans_preventive_maintenance"],
        },
        { kind: "rate", transitionId: "trans_order_supplier_a" },
      ],
      makeId,
    );

    expect(next.levers).toHaveLength(2);
    expect(next.levers[0]).toMatchObject({
      kind: "choice",
      transitionIds: ["trans_start_production", "trans_preventive_maintenance"],
    });
    expect(
      holdsAll(next, [
        { kind: "rate", transitionId: "trans_order_supplier_a" },
      ]),
    ).toBe(true);
  });
});
