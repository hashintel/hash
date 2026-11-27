import { describe, expect, test, vi } from "vitest";

import {
  ConversationClassificationError,
  ensureConversationClassificationsPreserved,
} from "../src/conversation-entity-restrictions.js";
import {
  deserializeSearchEntitiesResponse,
  HashEntity,
  HashLinkEntity,
  mergePropertyObjectAndMetadata,
  patchesFromPropertyObjects,
  serializeSearchEntitiesResponse,
} from "../src/entity.js";

import type { ClosedMultiEntityTypeMap } from "../src/entity-type.js";
import type { SearchEntitiesResponse } from "../src/entity.js";
import type {
  ActorEntityUuid,
  BaseUrl,
  ClosedMultiEntityType,
  Confidence,
  PropertyObject,
  PropertyObjectMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  Entity as GraphApiEntity,
  GraphApi,
} from "@local/hash-graph-client";

const base_url_a = "https://example.com/property-type/a/" as BaseUrl;
const base_url_aa = "https://example.com/property-type/aa/" as BaseUrl;
const base_url_aaa = "https://example.com/property-type/aaa/" as BaseUrl;
const base_url_aaaa = "https://example.com/property-type/aaaa/" as BaseUrl;
const base_url_b = "https://example.com/property-type/b/" as BaseUrl;
const base_url_bb = "https://example.com/property-type/bb/" as BaseUrl;
const base_url_b10b = "https://example.com/property-type/b10b/" as BaseUrl;
const base_url_b10bb = "https://example.com/property-type/b10bb/" as BaseUrl;
const base_url_c = "https://example.com/property-type/c/" as BaseUrl;
const base_url_cc = "https://example.com/property-type/c/" as BaseUrl;

const createTestEntity = (): GraphApiEntity => ({
  metadata: {
    archived: false,
    confidence: 0.5,
    entityTypeIds: ["https://hash.ai/@h/types/entity-type/person/v/1"],
    provenance: {
      createdAtDecisionTime: "2001-01-01T00:00:00Z",
      createdAtTransactionTime: "2001-01-01T00:00:00Z",
      createdById: "4ed14962-7132-4453-8fc5-39b5c2131d45",
      firstNonDraftCreatedAtDecisionTime: "2001-01-01T00:00:00Z",
      firstNonDraftCreatedAtTransactionTime: "2001-01-01T00:00:00Z",
      edition: {
        createdById: "4ed14962-7132-4453-8fc5-39b5c2131d45",
        actorType: "machine",
        origin: {
          type: "api",
        },
      },
    },
    temporalVersioning: {
      decisionTime: {
        start: {
          kind: "inclusive",
          limit: "2001-01-01T00:00:00Z",
        },
        end: {
          kind: "unbounded",
        },
      },
      transactionTime: {
        start: {
          kind: "inclusive",
          limit: "2001-01-01T00:00:00Z",
        },
        end: {
          kind: "unbounded",
        },
      },
    },
    recordId: {
      // random uuid
      editionId: "b152948f-5bc2-43e6-a6ff-87d8006f0fae",
      entityId:
        "36fb3cd2-a500-493e-ab1e-e0b3a40839aa~17562306-35b5-4bb1-bda3-1c5ddea833ea",
    },
    properties: {
      value: {
        [base_url_a]: {
          value: {
            [base_url_aa]: {
              value: {
                [base_url_aaa]: {
                  metadata: {
                    confidence: 0.1 as Confidence,
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                },
              },
            },
          },
          metadata: {
            confidence: 0.2 as Confidence,
          },
        },
        [base_url_b]: {
          value: [
            {
              value: {
                [base_url_b10b]: {
                  metadata: {
                    confidence: 0.3 as Confidence,
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                  },
                },
              },
            },
          ],
          metadata: {
            confidence: 0.4 as Confidence,
          },
        },
        [base_url_c]: {
          value: [
            {
              metadata: {
                confidence: 0.5 as Confidence,
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
              },
            },
          ],
        },
      },
    } satisfies PropertyObjectMetadata,
  },
  properties: {},
});

test("Entity can be created from Graph API", () => {
  const testEntity = createTestEntity();
  const entityInstance = new HashEntity(testEntity);

  expect(entityInstance.entityId).toBe(testEntity.metadata.recordId.entityId);
});

test("propertyMetadata access", () => {
  const entityInstance = new HashEntity(createTestEntity());

  expect(entityInstance.propertyMetadata([base_url_a])).toEqual({
    value: {
      [base_url_aa]: {
        value: {
          [base_url_aaa]: {
            metadata: {
              confidence: 0.1,
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      },
    },
    metadata: {
      confidence: 0.2,
    },
  });

  expect(entityInstance.propertyMetadata([base_url_a, base_url_aa])).toEqual({
    value: {
      [base_url_aaa]: {
        metadata: {
          confidence: 0.1,
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
    },
  });

  expect(
    entityInstance.propertyMetadata([base_url_a, base_url_aa, base_url_aaa]),
  ).toEqual({
    metadata: {
      confidence: 0.1,
      dataTypeId:
        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
    },
  });

  expect(
    entityInstance.propertyMetadata([
      base_url_a,
      base_url_aa,
      base_url_aaa,
      base_url_aaaa,
    ]),
  ).toBeUndefined();

  expect(entityInstance.propertyMetadata([base_url_b])).toEqual({
    value: [
      {
        value: {
          [base_url_b10b]: {
            metadata: {
              confidence: 0.3,
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
            },
          },
        },
      },
    ],
    metadata: {
      confidence: 0.4,
    },
  });

  expect(
    entityInstance.propertyMetadata([base_url_b, base_url_bb]),
  ).toBeUndefined();

  expect(entityInstance.propertyMetadata([base_url_b, 10])).toBeUndefined();

  expect(entityInstance.propertyMetadata([base_url_b, 20])).toBeUndefined();

  expect(
    entityInstance.propertyMetadata([base_url_b, 0, base_url_b10b]),
  ).toEqual({
    metadata: {
      confidence: 0.3,
      dataTypeId:
        "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
    },
  });

  expect(
    entityInstance.propertyMetadata([
      base_url_b,
      10,
      base_url_b10b,
      base_url_b10bb,
    ]),
  ).toBeUndefined();

  expect(entityInstance.propertyMetadata([base_url_c])).toEqual({
    value: [
      {
        metadata: {
          confidence: 0.5,
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      },
    ],
  });

  expect(entityInstance.propertyMetadata([base_url_c, 1])).toBeUndefined();

  expect(
    entityInstance.propertyMetadata([base_url_c, 0, base_url_cc]),
  ).toBeUndefined();

  expect(entityInstance.propertyMetadata([base_url_c, 0])).toEqual({
    metadata: {
      confidence: 0.5,
      dataTypeId:
        "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
    },
  });
});

test("search entities response round-trips through serialization", () => {
  const entity = new HashEntity(createTestEntity());
  const response: SearchEntitiesResponse = {
    entities: [entity],
  };

  const serialized = serializeSearchEntitiesResponse(response);

  // Serialized entities are plain JSON, not `HashEntity` instances.
  expect(serialized.entities[0]).toEqual(entity.toJSON());

  const deserialized = deserializeSearchEntitiesResponse(serialized);

  expect(deserialized.entities).toHaveLength(1);
  expect(deserialized.entities[0]).toBeInstanceOf(HashEntity);
  expect(deserialized.entities[0]!.entityId).toBe(entity.entityId);
});

test("flattened properties", () => {
  const entityInstance = new HashEntity(createTestEntity());

  expect(entityInstance.flattenedPropertiesMetadata()).toStrictEqual([
    {
      path: [base_url_a, base_url_aa, base_url_aaa],
      metadata: {
        confidence: 0.1,
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    },
    { path: [base_url_a], metadata: { confidence: 0.2 } },
    {
      path: [base_url_b, 0, base_url_b10b],
      metadata: {
        confidence: 0.3,
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
      },
    },
    { path: [base_url_b], metadata: { confidence: 0.4 } },
    {
      path: [base_url_c, 0],
      metadata: {
        confidence: 0.5,
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
      },
    },
  ]);
});

const textDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";

const patchTestProperties: PropertyObject = {
  [base_url_a]: "unchanged",
  [base_url_b]: ["x", "y"],
};

const patchTestMetadata: PropertyObjectMetadata = {
  value: {
    [base_url_a]: { metadata: { dataTypeId: textDataTypeId } },
    [base_url_b]: {
      value: [
        { metadata: { dataTypeId: textDataTypeId } },
        { metadata: { dataTypeId: textDataTypeId } },
      ],
    },
  },
};

test("patchesFromPropertyObjects omits properties that are deep-equal", () => {
  const patches = patchesFromPropertyObjects({
    oldProperties: mergePropertyObjectAndMetadata(
      patchTestProperties,
      patchTestMetadata,
    ),
    newProperties: mergePropertyObjectAndMetadata(
      structuredClone(patchTestProperties),
      structuredClone(patchTestMetadata),
    ),
  });

  expect(patches).toStrictEqual([]);
});

test("patchesFromPropertyObjects patches changed, added and removed properties", () => {
  const newProperties = mergePropertyObjectAndMetadata(
    {
      [base_url_b]: ["x", "y", "z"],
      [base_url_c]: "added",
    },
    {
      value: {
        [base_url_b]: {
          value: [
            { metadata: { dataTypeId: textDataTypeId } },
            { metadata: { dataTypeId: textDataTypeId } },
            { metadata: { dataTypeId: textDataTypeId } },
          ],
        },
        [base_url_c]: { metadata: { dataTypeId: textDataTypeId } },
      },
    },
  );

  const patches = patchesFromPropertyObjects({
    oldProperties: mergePropertyObjectAndMetadata(
      patchTestProperties,
      patchTestMetadata,
    ),
    newProperties,
  });

  expect(patches).toStrictEqual([
    {
      op: "replace",
      path: [base_url_b],
      property: newProperties.value[base_url_b],
    },
    {
      op: "add",
      path: [base_url_c],
      property: newProperties.value[base_url_c],
    },
    { op: "remove", path: [base_url_a] },
  ]);
});

test("patchesFromPropertyObjects patches a property whose metadata alone changed", () => {
  const newMetadata: PropertyObjectMetadata = {
    value: {
      ...patchTestMetadata.value,
      [base_url_a]: {
        metadata: { dataTypeId: textDataTypeId, confidence: 0.5 as Confidence },
      },
    },
  };
  const newProperties = mergePropertyObjectAndMetadata(
    patchTestProperties,
    newMetadata,
  );

  const patches = patchesFromPropertyObjects({
    oldProperties: mergePropertyObjectAndMetadata(
      patchTestProperties,
      patchTestMetadata,
    ),
    newProperties,
  });

  expect(patches).toStrictEqual([
    {
      op: "replace",
      path: [base_url_a],
      property: newProperties.value[base_url_a],
    },
  ]);
});

describe("conversation classification preservation in patch", () => {
  const noteTypeId =
    "https://hash.ai/@h/types/entity-type/note/v/1" as VersionedUrl;
  const conversationTypeId =
    "https://hash.ai/@h/types/entity-type/agent-conversation/v/1" as VersionedUrl;
  const childConversationTypeId =
    "https://hash.ai/@h/types/entity-type/child-conversation/v/1" as VersionedUrl;
  const focusLinkTypeId =
    "https://hash.ai/@h/types/entity-type/has-agent-conversation-focus/v/1" as VersionedUrl;
  const otherLinkTypeId =
    "https://hash.ai/@h/types/entity-type/related-to/v/1" as VersionedUrl;
  const authentication = {
    actorId: "00000000-0000-0000-0000-000000000001" as ActorEntityUuid,
  };
  const provenance = {
    actorType: "user" as const,
    origin: { type: "api" as const },
  };

  const closedSchemaFor = (
    entries: ReadonlyArray<{
      id: VersionedUrl;
      parents?: readonly VersionedUrl[];
    }>,
  ): ClosedMultiEntityType =>
    ({
      allOf: entries.map(({ id, parents = [] }) => ({
        $id: id,
        title: id,
        description: "",
        allOf: parents.map((parentId) => ({
          $id: parentId,
          title: parentId,
          description: "",
        })),
      })),
      properties: {},
      links: {},
    }) as unknown as ClosedMultiEntityType;

  const buildClosedTypeMap = (
    definitions: Record<VersionedUrl, { parents?: readonly VersionedUrl[] }>,
    requestedSets: readonly (readonly VersionedUrl[])[],
  ): Record<VersionedUrl, ClosedMultiEntityTypeMap> => {
    const root: Record<VersionedUrl, ClosedMultiEntityTypeMap> = {};
    for (const typeIds of requestedSets) {
      const sorted = [...typeIds].toSorted();
      let current = root;
      const prefix: VersionedUrl[] = [];
      for (const typeId of sorted) {
        prefix.push(typeId);
        const schema = closedSchemaFor(
          prefix.map((id) => ({ id, parents: definitions[id]?.parents })),
        );
        current[typeId] ??= { schema };
        if (prefix.length < sorted.length) {
          current[typeId].inner ??= {};
          current = current[typeId].inner;
        }
      }
    }
    return root;
  };

  const createMockGraphApi = (
    definitions: Record<VersionedUrl, { parents?: readonly VersionedUrl[] }>,
    patchedEntity: GraphApiEntity,
  ) => {
    const getClosedMultiEntityTypes = vi.fn(
      (params: { entityTypeIds: VersionedUrl[][] }) =>
        Promise.resolve({
          entityTypes: buildClosedTypeMap(definitions, params.entityTypeIds),
        }),
    );
    const patchEntity = vi.fn(() => Promise.resolve(patchedEntity));
    return {
      graphApi: {
        getClosedMultiEntityTypes,
        patchEntity,
      } as unknown as GraphApi,
      getClosedMultiEntityTypes,
      patchEntity,
    };
  };

  const entityWithTypes = (
    entityTypeIds: [VersionedUrl, ...VersionedUrl[]],
  ) => {
    const raw = createTestEntity();
    raw.metadata.entityTypeIds = entityTypeIds;
    return { raw, entity: new HashEntity(raw) };
  };

  test("skips type lookup when entityTypeIds is omitted or unchanged", async () => {
    const { raw, entity } = entityWithTypes([conversationTypeId, noteTypeId]);
    const { graphApi, getClosedMultiEntityTypes, patchEntity } =
      createMockGraphApi({}, raw);

    await entity.patch(graphApi, authentication, { provenance });
    await entity.patch(graphApi, authentication, {
      entityTypeIds: [noteTypeId, conversationTypeId],
      provenance,
    });

    expect(getClosedMultiEntityTypes).not.toHaveBeenCalled();
    expect(patchEntity).toHaveBeenCalledTimes(2);
  });

  test("permits HashEntity.patch when Agent Conversation classification is preserved", async () => {
    const { raw, entity } = entityWithTypes([conversationTypeId]);
    const { graphApi, patchEntity } = createMockGraphApi(
      {
        [conversationTypeId]: {},
        [noteTypeId]: {},
        [childConversationTypeId]: { parents: [conversationTypeId] },
      },
      raw,
    );

    await entity.patch(graphApi, authentication, {
      entityTypeIds: [conversationTypeId, noteTypeId],
      provenance,
    });
    await entity.patch(graphApi, authentication, {
      entityTypeIds: [childConversationTypeId],
      provenance,
    });

    expect(patchEntity).toHaveBeenCalledTimes(2);
  });

  test("refuses HashEntity.patch that adds or removes Agent Conversation (directly or via subtype)", async () => {
    const definitions = {
      [conversationTypeId]: {},
      [noteTypeId]: {},
      [childConversationTypeId]: { parents: [conversationTypeId] },
    };

    const { raw: convRaw, entity: convEntity } = entityWithTypes([
      conversationTypeId,
    ]);
    const removeMock = createMockGraphApi(definitions, convRaw);
    await expect(
      convEntity.patch(removeMock.graphApi, authentication, {
        entityTypeIds: [noteTypeId],
        provenance,
      }),
    ).rejects.toThrow(ConversationClassificationError);
    expect(removeMock.patchEntity).not.toHaveBeenCalled();

    const { raw: noteRaw, entity: noteEntity } = entityWithTypes([noteTypeId]);
    const addMock = createMockGraphApi(definitions, noteRaw);
    await expect(
      noteEntity.patch(addMock.graphApi, authentication, {
        entityTypeIds: [noteTypeId, childConversationTypeId],
        provenance,
      }),
    ).rejects.toThrow(ConversationClassificationError);
    expect(addMock.patchEntity).not.toHaveBeenCalled();
  });

  test("refuses HashLinkEntity.patch that adds or removes Has Agent Conversation Focus", async () => {
    const definitions = {
      [focusLinkTypeId]: {},
      [otherLinkTypeId]: {},
    };

    const rawFocusLink = createTestEntity();
    rawFocusLink.metadata.entityTypeIds = [focusLinkTypeId];
    rawFocusLink.linkData = {
      leftEntityId: rawFocusLink.metadata.recordId.entityId,
      rightEntityId: rawFocusLink.metadata.recordId.entityId,
    };
    const focusLink = new HashLinkEntity(rawFocusLink);
    const removeMock = createMockGraphApi(definitions, rawFocusLink);

    await expect(
      focusLink.patch(removeMock.graphApi, authentication, {
        entityTypeIds: [otherLinkTypeId],
        provenance,
      }),
    ).rejects.toThrow(ConversationClassificationError);
    expect(removeMock.patchEntity).not.toHaveBeenCalled();

    const rawOtherLink = createTestEntity();
    rawOtherLink.metadata.entityTypeIds = [otherLinkTypeId];
    rawOtherLink.linkData = {
      leftEntityId: rawOtherLink.metadata.recordId.entityId,
      rightEntityId: rawOtherLink.metadata.recordId.entityId,
    };
    const otherLink = new HashLinkEntity(rawOtherLink);
    const addMock = createMockGraphApi(definitions, rawOtherLink);

    await expect(
      otherLink.patch(addMock.graphApi, authentication, {
        entityTypeIds: [focusLinkTypeId],
        provenance,
      }),
    ).rejects.toThrow(ConversationClassificationError);
    expect(addMock.patchEntity).not.toHaveBeenCalled();
  });

  test("batches multiple entity type transitions into one getClosedMultiEntityTypes call", async () => {
    const definitions = {
      [conversationTypeId]: {},
      [noteTypeId]: {},
      [childConversationTypeId]: { parents: [conversationTypeId] },
    };
    const { raw } = entityWithTypes([noteTypeId]);
    const { graphApi, getClosedMultiEntityTypes } = createMockGraphApi(
      definitions,
      raw,
    );

    await ensureConversationClassificationsPreserved({
      graphApi,
      authentication,
      transitions: [
        {
          previousEntityTypeIds: [noteTypeId],
          nextEntityTypeIds: [noteTypeId],
        },
        {
          previousEntityTypeIds: [conversationTypeId],
          nextEntityTypeIds: [conversationTypeId, noteTypeId],
        },
        {
          previousEntityTypeIds: [conversationTypeId],
          nextEntityTypeIds: [childConversationTypeId],
        },
      ],
    });

    expect(getClosedMultiEntityTypes).toHaveBeenCalledTimes(1);
    expect(getClosedMultiEntityTypes).toHaveBeenCalledWith(
      expect.objectContaining({
        entityTypeIds: [
          [conversationTypeId],
          [conversationTypeId, noteTypeId],
          [childConversationTypeId],
        ],
      }),
      expect.anything(),
    );
  });
});
