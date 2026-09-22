import { expect, test } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";

import {
  createBrowserMutationRecords,
  deriveAddPlaceEvidence,
  deriveCanonicalMutationEvidence,
  observeBrowserDefinition,
} from "./mutation-record";

const createHandle = () =>
  createJsonDocHandle({
    id: "document",
    initial: {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
    capabilities: { disabledExtensions: [] },
  });

test("binds records immutably to one document incarnation and conversation", () => {
  const handle = createHandle();
  const suppliedBinding = {
    documentId: "document",
    incarnationId: "incarnation",
    conversationId: "conversation",
  };
  const store = createBrowserMutationRecords({ handle, suppliedBinding });
  suppliedBinding.conversationId = "other";
  expect(store.binding).toEqual({
    documentId: "document",
    incarnationId: "incarnation",
    conversationId: "conversation",
  });
  expect(() =>
    createBrowserMutationRecords({
      handle,
      suppliedBinding: { ...suppliedBinding, documentId: "another-document" },
    }),
  ).toThrow("does not match");
});

test("derives transition and arc evidence from their sequential live boundaries", () => {
  const handle = createHandle();
  const instance = createPetrinaut({ document: handle });
  const transitionInput = {
    id: "serve",
    name: "Serve",
    inputArcs: [],
    outputArcs: [],
    lambdaType: "predicate" as const,
    lambdaCode: "",
    transitionKernelCode: "",
    x: 100,
    y: 0,
    targetSubnetId: null,
  };
  instance.mutations.addPlace({
    id: "queue",
    name: "Queue",
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
    targetSubnetId: null,
  });
  const beforeTransition = observeBrowserDefinition(handle);
  instance.mutations.addTransition(transitionInput);
  const afterTransition = observeBrowserDefinition(handle);
  const transitionEvidence = deriveCanonicalMutationEvidence({
    toolName: "addTransition",
    input: transitionInput,
    pre: beforeTransition,
    post: afterTransition,
  });
  expect(transitionEvidence.outcome).toBe("applied");
  expect(transitionEvidence.effects.created.map(({ path }) => path)).toContain(
    "/transitions/0/id",
  );

  const arcInput = {
    transitionId: "serve",
    arcDirection: "input" as const,
    placeId: "queue",
    weight: 1,
    type: "standard" as const,
    targetSubnetId: null,
  };
  instance.mutations.addArc(arcInput);
  const afterArc = observeBrowserDefinition(handle);
  const arcEvidence = deriveCanonicalMutationEvidence({
    toolName: "addArc",
    input: arcInput,
    pre: afterTransition,
    post: afterArc,
  });
  expect(arcEvidence.outcome).toBe("applied");
  expect(arcEvidence.effects.created.map(({ path }) => path)).toContain(
    "/transitions/0/inputArcs/0",
  );
  instance.dispose();
});

test("derives applied and no-op evidence from independent live observations", () => {
  const handle = createHandle();
  const pre = observeBrowserDefinition(handle);
  handle.change((draft) => {
    draft.places.push({
      id: "queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });
  });
  const post = observeBrowserDefinition(handle);
  const queueInput = {
    id: "queue",
    name: "Queue",
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
    targetSubnetId: null,
  };
  const applied = deriveAddPlaceEvidence({ input: queueInput, pre, post });
  expect(applied.outcome).toBe("applied");
  expect(applied.effects.created.map(({ path }) => path)).toContain(
    "/places/0/id",
  );
  expect(applied.effects.updated).toEqual([]);
  expect(applied.effects.deleted).toEqual([]);
  expect(applied.effects.derived).toEqual([]);
  expect(
    deriveAddPlaceEvidence({ input: queueInput, pre: post, post }),
  ).toEqual({
    outcome: "no-op",
    effects: { created: [], updated: [], deleted: [], derived: [] },
  });
  const unrelated = deriveAddPlaceEvidence({
    input: { ...queueInput, id: "not-created" },
    pre,
    post,
  });
  expect(unrelated.outcome).toBe("unknown");
  expect(unrelated.effects.created).toEqual([]);
  expect(unrelated.effects.derived.map(({ path }) => path)).toContain(
    "/places/0",
  );
});
