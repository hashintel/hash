import { describe, expect, it } from "vitest";

import {
  currentTimestamp,
  DATA_TYPE_META_SCHEMA,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { buildDataTypeTree, scopeTreeToRoot } from "./data-type-tree";

import type {
  ActorEntityUuid,
  BaseUrl,
  DataType,
  DataTypeWithMetadata,
  WebId,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";

// Null is not offered: absence is modelled on the property, not a data type
const primitiveRootOrder = ["Text", "Number", "Boolean", "List", "Object"];

const makeDataTypeFixture = (
  schema: DistributiveOmit<DataType, "$schema" | "kind">,
): DataTypeWithMetadata => {
  const [, baseUrl] = /^(.*\/)v\/\d+$/.exec(schema.$id) as unknown as [
    string,
    BaseUrl,
  ];

  return {
    schema: {
      ...schema,
      $schema: DATA_TYPE_META_SCHEMA,
      kind: "dataType",
    },
    metadata: {
      recordId: {
        baseUrl,
        version: makeOntologyTypeVersion({ major: 1 }),
      },
      temporalVersioning: {
        transactionTime: {
          start: { kind: "inclusive", limit: currentTimestamp() },
          end: { kind: "unbounded" },
        },
      },
      provenance: {
        edition: {
          createdById: "test-actor" as ActorEntityUuid,
          actorType: "user",
          origin: { type: "web-app" },
        },
      },
      webId: "test-web" as WebId,
    },
  };
};

const numberFromGraph = makeDataTypeFixture({
  $id: blockProtocolDataTypes.number.dataTypeId,
  title: "Number",
  description: "The graph's own copy",
  allOf: [{ $ref: blockProtocolDataTypes.value.dataTypeId }],
  abstract: false,
  type: "number",
});

const metresFromGraph = makeDataTypeFixture({
  $id: "https://example.com/@example/types/data-type/metres/v/1",
  title: "Metres",
  description: "A length in metres",
  allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
  abstract: false,
  type: "number",
});

const centimetresFromGraph = makeDataTypeFixture({
  $id: "https://example.com/@example/types/data-type/centimetres/v/1",
  title: "Centimetres",
  description: "A length in centimetres",
  allOf: [{ $ref: metresFromGraph.schema.$id }],
  abstract: false,
  type: "number",
});

describe("buildDataTypeTree", () => {
  it("offers every primitive root even when the graph holds no data types", () => {
    const tree = buildDataTypeTree({ latestDataTypes: {} });

    expect(tree.roots.map((root) => root.title)).toEqual(primitiveRootOrder);
    expect(tree.selectableCount).toBe(primitiveRootOrder.length);
  });

  it("prefers the graph's copy of a primitive over the built-in fallback", () => {
    const tree = buildDataTypeTree({
      latestDataTypes: {
        [numberFromGraph.metadata.recordId.baseUrl]: numberFromGraph,
        [metresFromGraph.metadata.recordId.baseUrl]: metresFromGraph,
      },
    });

    expect(tree.roots.map((root) => root.title)).toEqual(primitiveRootOrder);

    const numberRoot = tree.roots.find((root) => root.title === "Number")!;
    expect(numberRoot.description).toBe("The graph's own copy");
    expect(numberRoot.children.map((child) => child.title)).toEqual(["Metres"]);
  });

  it("never offers the type being edited, fallback or not", () => {
    const tree = buildDataTypeTree({
      latestDataTypes: {},
      excludedBaseUrl: blockProtocolDataTypes.number.dataTypeBaseUrl,
    });

    expect(tree.roots.map((root) => root.title)).not.toContain("Number");
  });

  it("scopes to a root's subtree, dropping the root layer", () => {
    const tree = buildDataTypeTree({
      latestDataTypes: {
        [numberFromGraph.metadata.recordId.baseUrl]: numberFromGraph,
        [metresFromGraph.metadata.recordId.baseUrl]: metresFromGraph,
        [centimetresFromGraph.metadata.recordId.baseUrl]: centimetresFromGraph,
      },
    });

    const scoped = scopeTreeToRoot(
      tree,
      blockProtocolDataTypes.number.dataTypeBaseUrl,
    );

    expect(scoped.roots.map((root) => root.title)).toEqual(["Metres"]);
    expect(scoped.nodeById.has(centimetresFromGraph.schema.$id)).toBe(true);
    expect(scoped.selectableCount).toBe(2);
  });

  it("keeps the full tree when the scoped root has nothing beneath it", () => {
    const tree = buildDataTypeTree({ latestDataTypes: {} });

    expect(
      scopeTreeToRoot(tree, blockProtocolDataTypes.number.dataTypeBaseUrl),
    ).toBe(tree);
  });

  it("keeps the edited type's descendants reachable, hoisted past its node", () => {
    const tree = buildDataTypeTree({
      latestDataTypes: {
        [numberFromGraph.metadata.recordId.baseUrl]: numberFromGraph,
        [metresFromGraph.metadata.recordId.baseUrl]: metresFromGraph,
        [centimetresFromGraph.metadata.recordId.baseUrl]: centimetresFromGraph,
      },
      excludedBaseUrl: metresFromGraph.metadata.recordId.baseUrl,
    });

    const numberRoot = tree.roots.find((root) => root.title === "Number")!;
    expect(numberRoot.children.map((child) => child.title)).toEqual([
      "Centimetres",
    ]);
    expect(tree.nodeById.has(metresFromGraph.schema.$id)).toBe(false);
  });
});
