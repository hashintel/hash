import { describe, expect, it } from "vitest";

import { supplyChainWithDisruption } from "@hashintel/petrinaut-core/examples";

import {
  readControllers,
  retargetLever,
  tokenFieldCount,
  tokenFieldPlaces,
  toggleInitialTokenField,
  typedPlace,
  toggleTokenField,
  writeControllers,
} from "./controllers";
import {
  addLevers,
  holdsAll,
  leverOptionsFor,
  tokenFieldTarget,
} from "./lever-options";

import type { Controller, Lever } from "./controllers";
import type { LeverDraft } from "./lever-options";

const net = supplyChainWithDisruption.petriNetDefinition;
const labels = (targetIds: string[]) =>
  leverOptionsFor(net, targetIds).map((option) => option.label);

describe("leverOptionsFor", () => {
  it("offers Initial tokens for a place", () => {
    expect(labels(["place_raw_materials"])).toEqual(["Initial tokens"]);
  });

  it("offers only Rate for two transitions that compete at one place", () => {
    expect(
      labels(["trans_start_production", "trans_preventive_maintenance"])
    ).toEqual(["Rate"]);
  });

  it("offers Token field with each typed output place and its fields for a single transition", () => {
    const options = leverOptionsFor(net, ["trans_start_production"]);
    expect(options.map((option) => option.label)).toEqual([
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
    expect(labels(["trans_supplier_a_disrupts"])).toEqual(["Rate"]);
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

describe("tokenFieldTarget", () => {
  const withField: Controller = {
    id: "b",
    name: "B",
    levers: [
      {
        id: "l",
        kind: "tokenField",
        transitionId: "trans_start_production",
        places: [],
      },
    ],
  };
  const plain: Controller = { id: "a", name: "A", levers: [] };

  it("prefers the picked controller, then one that already has the lever, then the first", () => {
    expect(
      tokenFieldTarget([plain, withField], "trans_start_production", "a")
    ).toBe(plain);
    expect(
      tokenFieldTarget([plain, withField], "trans_start_production", "gone")
    ).toBe(withField);
    expect(tokenFieldTarget([plain, withField], "trans_other", null)).toBe(
      plain
    );
    expect(tokenFieldTarget([], "trans_other", null)).toBeUndefined();
  });
});

describe("Initial tokens fields", () => {
  const withLever: Controller = {
    id: "c",
    name: "C",
    levers: [{ id: "l", kind: "initialTokens", placeId: "place_machine_up" }],
  };

  it("ticks fields in token type order and unticks them", () => {
    const tick = (controller: Controller, elementId: string, on: boolean) =>
      toggleInitialTokenField(net, controller, "l", elementId, on);
    const both = tick(
      tick(withLever, "machine_wear", true),
      "machine_health",
      true
    );
    expect(both.levers[0]).toMatchObject({
      elementIds: ["machine_health", "machine_wear"],
    });
    expect(tick(both, "machine_health", false).levers[0]).toMatchObject({
      elementIds: ["machine_wear"],
    });
  });

  it("finds no fields for an untyped place", () => {
    expect(typedPlace(net, "place_raw_materials")).toBeNull();
    expect(typedPlace(net, "place_machine_up")?.fields).toHaveLength(2);
  });

  it("parses elementIds and treats a missing list as none", () => {
    const read = (lever: object) =>
      readControllers({
        ...net,
        metadata: {
          controllerPrototype: [
            {
              id: "c",
              name: "C",
              levers: [
                { id: "l", kind: "initialTokens", placeId: "p", ...lever },
              ],
            },
          ],
        },
      })[0]?.levers[0];
    expect(read({ elementIds: ["a", 3] })).toMatchObject({ elementIds: ["a"] });
    expect(read({})).not.toHaveProperty("elementIds");
  });
});

describe("constraints and goal", () => {
  const read = (extra: object) =>
    readControllers({
      ...net,
      metadata: {
        controllerPrototype: [{ id: "c", name: "C", levers: [], ...extra }],
      },
    })[0];

  it("reads constraint ids and a goal, and tolerates their absence", () => {
    expect(
      read({
        constraintIds: ["a", 3],
        goal: { direction: "maximise", metricId: "metric_service_level" },
      })
    ).toMatchObject({
      constraintIds: ["a"],
      goal: { direction: "maximise", metricId: "metric_service_level" },
    });
    const bare = read({ goal: { direction: "sideways", metricId: "m" } });
    expect(bare).not.toHaveProperty("goal");
    expect(bare).not.toHaveProperty("constraintIds");
  });
});

describe("retargetLever", () => {
  it("keeps the Token fields that the new transition's outputs still have", () => {
    const lever: Lever = {
      id: "l",
      kind: "tokenField",
      transitionId: "trans_start_production",
      places: [
        { placeId: "place_machine_up", elementIds: ["machine_wear"] },
        {
          placeId: "place_wip",
          elementIds: ["batch_processing_left", "batch_source_mix"],
        },
      ],
    };
    expect(
      retargetLever(net, lever, "trans_preventive_maintenance")
    ).toMatchObject({
      transitionId: "trans_preventive_maintenance",
      places: [{ placeId: "place_machine_up", elementIds: ["machine_wear"] }],
    });
    expect(
      retargetLever(net, lever, "trans_machine_breakdown_random")
    ).toMatchObject({
      places: [{ placeId: "place_machine_down", elementIds: ["machine_wear"] }],
    });
  });

  it("moves a Rate and keeps Initial tokens fields only on the same token type", () => {
    expect(
      retargetLever(
        net,
        { id: "r", kind: "rate", transitionId: "trans_start_production" },
        "trans_preventive_maintenance"
      )
    ).toEqual({
      id: "r",
      kind: "rate",
      transitionId: "trans_preventive_maintenance",
    });
    const initial: Lever = {
      id: "i",
      kind: "initialTokens",
      placeId: "place_machine_up",
      elementIds: ["machine_health"],
    };
    expect(retargetLever(net, initial, "place_machine_down")).toEqual({
      ...initial,
      placeId: "place_machine_down",
    });
    expect(retargetLever(net, initial, "place_wip")).toEqual({
      id: "i",
      kind: "initialTokens",
      placeId: "place_wip",
    });
  });
});
