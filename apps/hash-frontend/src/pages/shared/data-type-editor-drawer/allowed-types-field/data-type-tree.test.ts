import { describe, expect, it } from "vitest";

import {
  currentTimestamp,
  DATA_TYPE_META_SCHEMA,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { buildDataTypeTree } from "./data-type-tree";

import type {
  ActorEntityUuid,
  BaseUrl,
  DataType,
  DataTypeWithMetadata,
  WebId,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";

const primitiveRootOrder = [
  "Text",
  "Number",
  "Boolean",
  "List",
  "Object",
  "Null",
];

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
});
