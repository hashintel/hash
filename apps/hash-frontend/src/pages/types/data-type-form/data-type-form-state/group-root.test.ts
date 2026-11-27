import { describe, expect, it } from "vitest";

import {
  currentTimestamp,
  DATA_TYPE_META_SCHEMA,
  makeOntologyTypeVersion,
} from "@blockprotocol/type-system";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { lowestCommonAncestorRef } from "./group-root";

import type {
  ActorEntityUuid,
  BaseUrl,
  DataType,
  DataTypeWithMetadata,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";

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

const id = (name: string) =>
  `https://example.com/@test/types/data-type/${name}/v/1` as VersionedUrl;

const number = makeDataTypeFixture({
  $id: blockProtocolDataTypes.number.dataTypeId,
  title: "Number",
  description: "A number",
  allOf: [{ $ref: blockProtocolDataTypes.value.dataTypeId }],
  abstract: false,
  type: "number",
});

const length = makeDataTypeFixture({
  $id: id("length"),
  title: "Length",
  description: "A length",
  allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
  abstract: false,
  type: "number",
});

const centimetres = makeDataTypeFixture({
  $id: id("centimetres"),
  title: "Centimetres",
  description: "A length in centimetres",
  allOf: [{ $ref: id("length") }],
  abstract: false,
  type: "number",
});

const metres = makeDataTypeFixture({
  $id: id("metres"),
  title: "Metres",
  description: "A length in metres",
  allOf: [{ $ref: id("length") }],
  abstract: false,
  type: "number",
});

const group = makeDataTypeFixture({
  $id: id("group"),
  title: "Group",
  description: "An abstract group",
  allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
  abstract: true,
  type: "number",
});

const groupMember = makeDataTypeFixture({
  $id: id("group-member"),
  title: "Group member",
  description: "A member extending only its group",
  allOf: [{ $ref: id("group") }],
  abstract: false,
  type: "number",
});

const fixtures = [number, length, centimetres, metres, group, groupMember];

const latestDataTypes = Object.fromEntries(
  fixtures.map((dataType) => [dataType.metadata.recordId.baseUrl, dataType]),
) as Record<BaseUrl, DataTypeWithMetadata>;

const resolveDataType = (dataTypeId: VersionedUrl) =>
  fixtures.find((dataType) => dataType.schema.$id === dataTypeId);

describe("lowestCommonAncestorRef", () => {
  it("finds the members' nearest shared ancestor", () => {
    expect(
      lowestCommonAncestorRef({
        memberDataTypeIds: [centimetres.schema.$id, metres.schema.$id],
        resolveDataType,
        latestDataTypes,
      }),
    ).toBe(length.schema.$id);
  });

  it("keeps the ancestor strict when a member is another member's ancestor", () => {
    expect(
      lowestCommonAncestorRef({
        memberDataTypeIds: [centimetres.schema.$id, length.schema.$id],
        resolveDataType,
        latestDataTypes,
      }),
    ).toBe(number.schema.$id);
  });

  it("skips the group itself when a member reaches ancestors through it", () => {
    expect(
      lowestCommonAncestorRef({
        memberDataTypeIds: [groupMember.schema.$id],
        excludeBaseUrl: group.metadata.recordId.baseUrl,
        resolveDataType,
        latestDataTypes,
      }),
    ).toBe(number.schema.$id);
  });

  it("returns null when a member's ancestry can't be resolved", () => {
    expect(
      lowestCommonAncestorRef({
        memberDataTypeIds: [id("unknown")],
        resolveDataType,
        latestDataTypes,
      }),
    ).toBeNull();
  });
});
