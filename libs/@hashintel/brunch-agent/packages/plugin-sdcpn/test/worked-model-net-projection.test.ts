import { describe, expect, test } from "vitest";

import {
  parseWorkedModelDefinition,
  parseWorkedModelNetProjection,
  parseWorkedModelNetProjectionDefinitionUpdate,
} from "../src/worked-model-net-projection";

const emptyDefinition = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const netProjection = {
  bundleKey: "inventory-purchasing",
  copyId: "copy-1",
  conversationId: "conversation-1",
  documentId: "document-1",
  incarnationId: "incarnation-1",
  fixtureVersion: "inventory-purchasing-v1",
  principalKey: "principal-a",
  title: "Inventory purchasing",
  definition: emptyDefinition,
  definitionSha256: "a".repeat(64),
  revisionId: "revision-1",
};

describe("worked-model net-projection wire parse", () => {
  test("accepts a complete projection and refuses a blank identity", () => {
    expect(parseWorkedModelNetProjection(netProjection)).toMatchObject(
      netProjection,
    );
    expect(() =>
      parseWorkedModelNetProjection({ ...netProjection, copyId: "" }),
    ).toThrow(/copyId/u);
  });

  test("accepts a definition update and refuses a hash or revision that does not advance", () => {
    const update = {
      expectedSha256: "a".repeat(64),
      expectedRevisionId: "revision-1",
      definition: emptyDefinition,
      revisionId: "revision-2",
    };
    expect(parseWorkedModelNetProjectionDefinitionUpdate(update)).toEqual({
      ...update,
      definition: parseWorkedModelDefinition(emptyDefinition),
    });
    expect(() =>
      parseWorkedModelNetProjectionDefinitionUpdate({
        ...update,
        expectedSha256: "not-a-hash",
      }),
    ).toThrow(/hash/u);
    expect(() =>
      parseWorkedModelNetProjectionDefinitionUpdate({
        ...update,
        revisionId: "revision-1",
      }),
    ).toThrow(/advance/u);
  });
});
