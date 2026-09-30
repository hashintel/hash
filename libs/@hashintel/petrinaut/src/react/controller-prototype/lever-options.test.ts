import { describe, expect, it } from "vitest";

import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import {
  readControllers,
  tokenFieldCount,
  tokenFieldPlaces,
  toggleTokenField,
  writeControllers,
} from "./controllers";
import { addLevers, holdsAll, leverOptionsFor } from "./lever-options";

import type { Controller } from "./controllers";
import type { LeverDraft } from "./lever-options";

const net = supplyChainWithDisruption.petriNetDefinition;
const labels = (targetIds: string[]) =>
  leverOptionsFor(net, targetIds).map((option) => option.label);

describe("leverOptionsFor", () => {
  it("offers Initial tokens for a place", () => {
    expect(labels(["place_raw_materials"])).toEqual(["Initial tokens"]);
  });

  it("offers Choice and Rate for two transitions that compete at one place", () => {
    expect(
      labels(["trans_start_production", "trans_preventive_maintenance"])
    ).toEqual(["Choice at MachineUp", "Rate"]);
  });

  it("offers Token field with each typed output place and its fields for a single transition", () => {
    const options = leverOptionsFor(net, ["trans_start_production"]);
    expect(options.map((option) => option.label)).toEqual([
      "Choice at MachineUp",
      "Rate",
      "Token field",
    ]);
    const tokenField = options.find((option) => "places" in option);
    expect(
      tokenField && "places" in tokenField
        ? tokenField.places.map((place) => [
            place.placeName,
            place.fields.map((field) => field.name),
          ])
        : []
    ).toEqual([
      ["MachineUp", ["health", "wear"]],
      ["WorkInProcess", ["processing_left", "quality", "source_mix", "cost"]],
    ]);
  });

  it("offers no Token field for a transition without a typed output place", () => {
    expect(tokenFieldPlaces(net, "trans_supplier_a_disrupts")).toEqual([]);
    expect(labels(["trans_supplier_a_disrupts"])).toEqual([
      "Choice at SupplierAAvailable",
      "Rate",
    ]);
  });

  it("offers nothing for a mix of places and transitions", () => {
    expect(labels(["place_raw_materials", "trans_start_production"])).toEqual(
      []
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
      makeId
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
      makeId
    );

    expect(next.levers).toHaveLength(2);
    expect(next.levers[0]).toMatchObject({
      kind: "choice",
      transitionIds: ["trans_start_production", "trans_preventive_maintenance"],
    });
    expect(
      holdsAll(next, [{ kind: "rate", transitionId: "trans_order_supplier_a" }])
    ).toBe(true);
  });
});

describe("toggleTokenField", () => {
  const empty: Controller = { id: "c", name: "C", levers: [] };
  const tick = (
    controller: Controller,
    placeId: string,
    elementId: string,
    on: boolean
  ) =>
    toggleTokenField(
      net,
      controller,
      "trans_start_production",
      placeId,
      elementId,
      on,
      () => "lever_new"
    );

  it("creates the lever and keeps fields in token type order", () => {
    const next = tick(
      tick(empty, "place_wip", "batch_source_mix", true),
      "place_wip",
      "batch_quality",
      true
    );
    expect(next.levers).toEqual([
      {
        id: "lever_new",
        kind: "tokenField",
        transitionId: "trans_start_production",
        places: [
          {
            placeId: "place_wip",
            elementIds: ["batch_quality", "batch_source_mix"],
          },
        ],
      },
    ]);
  });

  it("orders places like the transition's output arcs", () => {
    const next = tick(
      tick(empty, "place_wip", "batch_cost", true),
      "place_machine_up",
      "machine_wear",
      true
    );
    const lever = next.levers[0];
    expect(
      lever?.kind === "tokenField" ? lever.places.map((p) => p.placeId) : []
    ).toEqual(["place_machine_up", "place_wip"]);
  });

  it("keeps the lever with no fields after the last one is unticked", () => {
    const next = tick(
      tick(empty, "place_wip", "batch_cost", true),
      "place_wip",
      "batch_cost",
      false
    );
    const lever = next.levers[0];
    expect(lever).toMatchObject({ kind: "tokenField", places: [] });
    expect(lever?.kind === "tokenField" ? tokenFieldCount(lever) : -1).toBe(0);
  });
});

describe("addLevers with a Token field", () => {
  it("merges fields into the lever for the same transition", () => {
    const draft = (elementId: string): LeverDraft => ({
      kind: "tokenField",
      transitionId: "trans_start_production",
      places: [{ placeId: "place_wip", elementIds: [elementId] }],
    });
    const start = addLevers(
      { id: "c", name: "C", levers: [] },
      [draft("batch_cost")],
      () => "lever_0"
    );
    const next = addLevers(start, [draft("batch_quality")], () => "lever_1");
    expect(next.levers).toHaveLength(1);
    expect(holdsAll(next, [draft("batch_cost"), draft("batch_quality")])).toBe(
      true
    );
    expect(holdsAll(start, [draft("batch_quality")])).toBe(false);
  });
});

describe("readControllers", () => {
  it("reads the V3 single-field Token field shape", () => {
    const sdcpn = {
      ...net,
      metadata: {
        controllerPrototype: [
          {
            id: "c",
            name: "C",
            levers: [
              {
                id: "l",
                kind: "tokenField",
                transitionId: "trans_start_production",
                placeId: "place_wip",
                elementId: "batch_cost",
              },
            ],
          },
        ],
      },
    };
    expect(readControllers(sdcpn)[0]?.levers).toEqual([
      {
        id: "l",
        kind: "tokenField",
        transitionId: "trans_start_production",
        places: [{ placeId: "place_wip", elementIds: ["batch_cost"] }],
      },
    ]);
    const written = structuredClone(sdcpn);
    writeControllers(written, readControllers(sdcpn));
    expect(readControllers(written)).toEqual(readControllers(sdcpn));
  });
});
