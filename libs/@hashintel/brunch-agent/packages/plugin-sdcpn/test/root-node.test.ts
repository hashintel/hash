import { describe, expect, test } from "vitest";

import { createPetrinautActions, type SDCPN } from "@hashintel/petrinaut-core";

import {
  deriveMutationEffects,
  expectedNodeDefinition,
} from "../src/mutation-record";
import {
  locateRootNode,
  parseConstructionWhyInput,
  queryWorkpieceInputSchema,
} from "../src/root-node";
import {
  constructionRequest as request,
  emptyDefinition as empty,
  observedOutcome as outcome,
} from "./fixtures";

const place = {
  id: "test-place",
  name: "TestPlace",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
} satisfies SDCPN["places"][number];
const transition = {
  id: "test-transition",
  name: "Test transition",
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "export default () => true;",
  transitionKernelCode: "",
  x: 100,
  y: 0,
} satisfies SDCPN["transitions"][number];

describe("query workpiece input", () => {
  test("keeps protocol correlation host-owned while retaining legacy parsing", () => {
    const selector = {
      kind: "place" as const,
      name: "Waiting",
      observationToolCallId: "legacy-read-call",
    };

    expect(
      queryWorkpieceInputSchema(true).safeParse({
        selector: { kind: "place", name: "Waiting" },
      }).success,
    ).toBe(true);
    expect(
      queryWorkpieceInputSchema(true).safeParse({ selector }).success,
    ).toBe(false);
    expect(parseConstructionWhyInput(selector).observationToolCallId).toBe(
      "legacy-read-call",
    );
    const modelSchema = JSON.stringify(
      queryWorkpieceInputSchema(true)["~standard"].jsonSchema.input({
        target: "draft-2020-12",
      }),
    );
    expect(modelSchema).not.toContain("observationToolCallId");
    expect(modelSchema).not.toMatch(/baseHash|sha256/u);
    expect(modelSchema).not.toContain("read_petrinaut_net");
    expect(modelSchema).toContain("current mounted Petrinaut definition read");
  });
});

describe("native root node construction", () => {
  test("observes a transition with a component-port arc as applied", () => {
    // A live run: Petrinaut applied this transition, but a pre-classification
    // guard refused component ports, so it was recorded as unknown.
    const pre = empty();
    pre.places.push(place);
    pre.subnets = [
      {
        id: "sensor",
        name: "Sensor",
        places: [
          { ...place, id: "sensor-online", name: "Online", isPort: true },
        ],
        transitions: [],
        types: [],
        differentialEquations: [],
        parameters: [],
      },
    ];
    pre.componentInstances = [
      {
        id: "sensor-instance",
        name: "SensorInstance",
        subnetId: "sensor",
        parameterValues: {},
        x: 0,
        y: -100,
      },
    ];
    const input = {
      ...transition,
      inputArcs: [
        {
          endpoint: { kind: "place" as const, placeId: place.id },
          weight: 1,
          type: "standard" as const,
        },
        {
          endpoint: {
            kind: "componentPort" as const,
            componentInstanceId: "sensor-instance",
            portPlaceId: "sensor-online",
          },
          weight: 1,
          type: "read" as const,
        },
      ],
    };
    const req = request("addTransition", input);
    const post = expectedNodeDefinition(req, pre);
    expect(post.transitions).toHaveLength(1);
    expect(outcome(req, pre, post)).toBe("applied");
  });
  test("observes canonical creation and correction, not void success", () => {
    const pre = empty();
    const post = structuredClone(pre);
    createPetrinautActions((mutate) => mutate(post)).addPlace(place);
    const req = request("addPlace", place);
    expect(outcome(req, pre, post)).toBe("applied");
    expect(outcome(req, pre, pre)).toBe("unknown");
    const wrong = structuredClone(post);
    wrong.places[0]!.capacity = 9;
    expect(outcome(req, pre, wrong)).toBe("unknown");
    const correction = request("updatePlace", {
      placeId: place.id,
      update: { capacity: 2 },
    });
    const corrected = expectedNodeDefinition(correction, post);
    expect(outcome(correction, post, corrected)).toBe("applied");
    expect(deriveMutationEffects(correction, post, corrected).created).toEqual([
      { kind: "created", path: "/places/0/capacity", after: 2 },
    ]);
  });
  test("partitions generated kernels as derived without giving them request basis", () => {
    const pre = empty();
    pre.types.push({
      id: "test-type",
      name: "TestType",
      iconSlug: "circle",
      displayColor: "#ff0000",
      elements: [{ elementId: "test-element", name: "value", type: "integer" }],
    });
    pre.places.push({ ...place, colorId: "test-type" });
    const req = request("addTransition", {
      ...transition,
      outputArcs: [{ placeId: place.id, weight: 1 }],
    });
    const post = expectedNodeDefinition(req, pre);
    expect(post.transitions[0]!.transitionKernelCode).not.toBe("");
    const effects = deriveMutationEffects(req, pre, post);
    expect(effects.derived).toEqual([
      {
        kind: "created",
        path: "/transitions/0/transitionKernelCode",
        after: post.transitions[0]!.transitionKernelCode,
      },
    ]);
    expect(
      effects.created.some((effect) => effect.path === "/transitions/0/id"),
    ).toBe(true);
    expect(outcome(req, pre, post)).toBe("applied");
    const falsified = structuredClone(post);
    falsified.transitions[0]!.transitionKernelCode += "\n// unrecorded";
    expect(outcome(req, pre, falsified)).toBe("unknown");
  });
  test("accounts place correction's derived transition sanitization", () => {
    const pre = empty();
    pre.types.push({
      id: "test-type",
      name: "TestType",
      iconSlug: "circle",
      displayColor: "#ff0000",
      elements: [],
    });
    pre.places.push({ ...place, colorId: "test-type" });
    pre.transitions.push({
      ...transition,
      outputArcs: [{ placeId: place.id, weight: 1 }],
      transitionKernelCode: "export default () => ({ TestPlace: [{}] });",
    });
    const req = request("updatePlace", {
      placeId: place.id,
      update: { colorId: null },
    });
    const post = expectedNodeDefinition(req, pre);
    const effects = deriveMutationEffects(req, pre, post);
    expect(effects.updated).toContainEqual({
      kind: "updated",
      path: "/places/0/colorId",
      before: "test-type",
      after: null,
    });
    expect(
      effects.derived.some(
        (effect) => effect.path === "/transitions/0/transitionKernelCode",
      ),
    ).toBe(true);
    expect(outcome(req, pre, post)).toBe("applied");
  });
  test("ordinary names never choose an ambiguous occurrence or invent a field", () => {
    const definition = empty();
    definition.places.push(place);
    expect(
      locateRootNode(definition, {
        kind: "place",
        name: place.name,
        field: "entity",
      }).id,
    ).toBe(place.id);
    expect(() =>
      locateRootNode(definition, {
        kind: "place",
        name: place.name,
        field: "unknown",
      }),
    ).toThrow(/absent/);
    definition.places.push({ ...place, id: "different" });
    expect(() =>
      locateRootNode(definition, {
        kind: "place",
        name: place.name,
        field: "entity",
      }),
    ).toThrow(/ambiguous/);
  });
});
