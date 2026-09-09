import { describe, expect, test } from "vitest";

import { createPetrinautActions, type SDCPN } from "@hashintel/petrinaut-core";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  assertNodeIdentity,
  locateRootNode,
  observedNodeInputSchema,
  observedNodeMutationNames,
} from "../src/root-node";
import {
  deriveArcEffects,
  expectedNodeDefinition,
  observedArcOutcome,
  type ConstructionMutationRequest,
} from "../src/transition-record";

const empty = (): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
});
const place = {
  id: "test-place",
  name: "TestPlace",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};
const transition = {
  id: "test-transition",
  name: "Test transition",
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate" as const,
  lambdaCode: "export default () => true;",
  transitionKernelCode: "",
  x: 100,
  y: 0,
};
const request = (
  toolName: ConstructionMutationRequest["toolName"],
  input: ConstructionMutationRequest["input"],
): ConstructionMutationRequest => ({
  toolName,
  input,
  toolCallId: "test-call",
  requestedBaseHash: "a".repeat(64),
  binding: {
    conversationId: "test-conversation",
    documentId: "test-document",
    incarnationId: "test-incarnation",
  },
});
const outcome = (req: ConstructionMutationRequest, pre: SDCPN, post: SDCPN) =>
  observedArcOutcome({
    request: req,
    binding: req.binding,
    pre: { definition: pre, sha256: req.requestedBaseHash },
    post: { definition: post, sha256: "b".repeat(64) },
    effects: deriveArcEffects(req, pre, post),
  });

describe("native root node construction", () => {
  test.each(observedNodeMutationNames)(
    "%s retains canonical input export without field copies",
    (name) => {
      const canonical = petrinautAiTools[name].inputSchema.toJSONSchema({
        io: "input",
      });
      const joined = observedNodeInputSchema(name).toJSONSchema({
        io: "input",
      });
      const { brunch: _brunch, ...properties } = joined.properties!;
      expect({
        ...joined,
        properties,
        required: joined.required?.filter((key) => key !== "brunch"),
      }).toEqual(canonical);
    },
  );
  test("refuses existing, cross-class, retired, unknown and ambiguous identities", () => {
    const current = empty();
    current.places.push(place);
    expect(() =>
      assertNodeIdentity(request("addPlace", place), current, []),
    ).toThrow(/Duplicate/);
    expect(() =>
      assertNodeIdentity(
        request("addTransition", { ...transition, id: place.id }),
        current,
        [],
      ),
    ).toThrow(/Duplicate/);
    expect(() =>
      assertNodeIdentity(request("addPlace", place), empty(), [current]),
    ).toThrow(/retired/);
    expect(() =>
      assertNodeIdentity(
        request("updatePlace", { placeId: place.id, update: { capacity: 2 } }),
        empty(),
        [],
      ),
    ).toThrow(/Unknown/);
    current.places.push(place);
    expect(() =>
      assertNodeIdentity(
        request("updatePlace", { placeId: place.id, update: { capacity: 2 } }),
        current,
        [],
      ),
    ).toThrow(/ambiguous/);
  });
  test("observes canonical creation and correction, not void success", () => {
    const pre = empty();
    const post = structuredClone(pre);
    createPetrinautActions((mutate) => mutate(post)).addPlace(place);
    const req = request("addPlace", place);
    expect(outcome(req, pre, post)).toBe("applied");
    expect(outcome(req, pre, pre)).toBe("no-op");
    const wrong = structuredClone(post);
    wrong.places[0]!.capacity = 9;
    expect(outcome(req, pre, wrong)).toBe("unknown");
    const correction = request("updatePlace", {
      placeId: place.id,
      update: { capacity: 2 },
    });
    const corrected = expectedNodeDefinition(correction, post);
    expect(outcome(correction, post, corrected)).toBe("applied");
    expect(deriveArcEffects(correction, post, corrected).created).toEqual([
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
    const effects = deriveArcEffects(req, pre, post);
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
    const effects = deriveArcEffects(req, pre, post);
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
