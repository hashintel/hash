import { describe, expect, it, vi } from "vitest";

import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { ensureConversationClassificationPreserved } from "./ensure-conversation-classification-preserved";

import type { ImpureGraphContext } from "../../../context-types";
import type {
  ClosedMultiEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { ClosedMultiEntityTypeMap } from "@local/hash-graph-sdk/entity-type";

const noteTypeId =
  "https://hash.ai/@h/types/entity-type/note/v/1" as VersionedUrl;
const childConversationTypeId =
  "https://hash.ai/@h/types/entity-type/child-conversation/v/1" as VersionedUrl;
const conversationTypeId = systemEntityTypes.agentConversation.entityTypeId;
const focusLinkTypeId =
  systemLinkEntityTypes.hasAgentConversationFocus.linkEntityTypeId;

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

const buildClosedMultiEntityTypeMap = (
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
      if (!current[typeId]) {
        current[typeId] = { schema };
      }
      if (prefix.length < sorted.length) {
        current[typeId].inner ??= {};
        current = current[typeId].inner;
      }
    }
  }
  return root;
};

const createMockContext = (
  definitions: Record<VersionedUrl, { parents?: readonly VersionedUrl[] }>,
) => {
  const getClosedMultiEntityTypes = vi.fn(
    async (params: { entityTypeIds: VersionedUrl[][] }) => ({
      entityTypes: buildClosedMultiEntityTypeMap(
        definitions,
        params.entityTypeIds,
      ),
    }),
  );

  return {
    context: {
      graphApi: { getClosedMultiEntityTypes },
    } as unknown as ImpureGraphContext<false, true>,
    authentication: {
      actorId: "00000000-0000-0000-0000-000000000001" as never,
    },
    getClosedMultiEntityTypes,
  };
};

describe("ensureConversationClassificationPreserved", () => {
  it("skips lookup when entityTypeIds is omitted or unchanged", async () => {
    const { context, authentication, getClosedMultiEntityTypes } =
      createMockContext({});

    await ensureConversationClassificationPreserved({
      context,
      authentication,
      previousEntityTypeIds: [conversationTypeId],
      nextEntityTypeIds: undefined,
    });

    await ensureConversationClassificationPreserved({
      context,
      authentication,
      previousEntityTypeIds: [conversationTypeId, noteTypeId],
      nextEntityTypeIds: [noteTypeId, conversationTypeId],
    });

    expect(getClosedMultiEntityTypes).not.toHaveBeenCalled();
  });

  it("permits type changes that keep Agent Conversation classification unchanged", async () => {
    const { context, authentication } = createMockContext({
      [conversationTypeId]: {},
      [noteTypeId]: {},
      [childConversationTypeId]: { parents: [conversationTypeId] },
    });

    await expect(
      ensureConversationClassificationPreserved({
        context,
        authentication,
        previousEntityTypeIds: [conversationTypeId],
        nextEntityTypeIds: [conversationTypeId, noteTypeId],
      }),
    ).resolves.toBeUndefined();

    await expect(
      ensureConversationClassificationPreserved({
        context,
        authentication,
        previousEntityTypeIds: [conversationTypeId],
        nextEntityTypeIds: [childConversationTypeId],
      }),
    ).resolves.toBeUndefined();
  });

  it("refuses removing or adding Agent Conversation (directly or by subtype)", async () => {
    const { context, authentication } = createMockContext({
      [conversationTypeId]: {},
      [noteTypeId]: {},
      [childConversationTypeId]: { parents: [conversationTypeId] },
    });

    await expect(
      ensureConversationClassificationPreserved({
        context,
        authentication,
        previousEntityTypeIds: [conversationTypeId],
        nextEntityTypeIds: [noteTypeId],
      }),
    ).rejects.toThrow("must preserve the Agent Conversation classification");

    await expect(
      ensureConversationClassificationPreserved({
        context,
        authentication,
        previousEntityTypeIds: [noteTypeId],
        nextEntityTypeIds: [noteTypeId, childConversationTypeId],
      }),
    ).rejects.toThrow("must preserve the Agent Conversation classification");
  });

  it("refuses adding or removing Has Agent Conversation Focus", async () => {
    const { context, authentication } = createMockContext({
      [focusLinkTypeId]: {},
      [noteTypeId]: {},
    });

    await expect(
      ensureConversationClassificationPreserved({
        context,
        authentication,
        previousEntityTypeIds: [noteTypeId],
        nextEntityTypeIds: [focusLinkTypeId],
      }),
    ).rejects.toThrow(
      "must preserve the Has Agent Conversation Focus classification",
    );
  });
});
