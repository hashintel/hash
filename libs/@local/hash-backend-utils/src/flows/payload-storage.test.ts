import { describe, expect, it } from "vitest";

import { generateStepRunId } from "@local/hash-isomorphic-utils/flows/step-run-id";
import {
  appendCollectedValue,
  getArrayPayloadItems,
  getArrayPayloadLength,
} from "@local/hash-isomorphic-utils/flows/stored-payload-refs";

import {
  resolveInputPayload,
  resolvePayloadValue,
  prepareOutputPayload,
  storePayload,
} from "./payload-storage.js";

import type { FileStorageProvider } from "../file-storage.js";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  ActionDefinitionTypes,
  InputKindsOf,
  SimplifiedInputsOf,
  StepOutputOf,
} from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  ArrayStoredPayloadRef,
  PersistedEntityMetadata,
  ProposedEntity,
  SingularStoredPayloadRef,
  StoredItemRef,
} from "@local/hash-isomorphic-utils/flows/types";

/**
 * An in-memory storage provider, counting downloads.
 */
const createMemoryStorageProvider = () => {
  const objects = new Map<string, string>();
  let downloads = 0;

  const provider = {
    uploadDirect: ({ key, body }: { key: string; body: string }) => {
      objects.set(key, body);
      return Promise.resolve();
    },
    downloadDirect: ({ key }: { key: string }) => {
      downloads += 1;

      const body = objects.get(key);

      return body === undefined
        ? Promise.reject(new Error(`No object ${key}`))
        : Promise.resolve(Buffer.from(body));
    },
  };

  return {
    storageProvider: provider as unknown as FileStorageProvider,
    getDownloadCount: () => downloads,
    getObjectCount: () => objects.size,
  };
};

/**
 * A proposed entity, told apart from others by its local id.
 */
const entity = (index: number) =>
  ({
    claims: { isSubjectOf: [], isObjectOf: [] },
    provenance: { actorType: "ai", origin: { type: "flow" } },
    propertyMetadata: { value: {} },
    localEntityId: `entity-${index}`,
    entityTypeIds: ["https://hash.ai/@h/types/entity-type/person/v/1"],
    properties: {},
  }) as unknown as ProposedEntity;

const entityId = (index: number) =>
  `d4e16033-c281-4cde-aa35-9085bf2e7579~0f5f3bd1-3a28-4b9f-9e3a-5b4a6b1c2d${String(index).padStart(2, "0")}` as EntityId;

/**
 * The workflow every test's run belongs to.
 */
const workflowId = "workflow";

const storeEntities = (
  storageProvider: FileStorageProvider,
  stepId: string,
  entities: ProposedEntity[],
) =>
  storePayload({
    storageProvider,
    workflowId,
    runId: `run-${Math.random()}`,
    stepId,
    outputName: "proposedEntities",
    kind: "ProposedEntity",
    value: entities,
  });

describe("stored arrays", () => {
  it("records an array's length on its reference", async () => {
    const { storageProvider } = createMemoryStorageProvider();

    const ref = await storeEntities(storageProvider, "persist", [
      entity(0),
      entity(1),
      entity(2),
    ]);

    expect(ref).toMatchObject({ array: true, length: 3 });
    expect(getArrayPayloadLength(ref)).toBe(3);
  });

  it("resolves the items of a stored array, downloading it once", async () => {
    const { storageProvider, getDownloadCount } = createMemoryStorageProvider();

    const ref = await storeEntities(storageProvider, "persist", [
      entity(0),
      entity(1),
      entity(2),
    ]);

    const items = getArrayPayloadItems(ref);

    const resolvedItems = await Promise.all(
      items.map((item) =>
        resolvePayloadValue(
          { storageProvider, workflowId },
          "ProposedEntity",
          item as SingularStoredPayloadRef<"ProposedEntity">,
        ),
      ),
    );

    expect(resolvedItems).toEqual([entity(0), entity(1), entity(2)]);
    expect(getDownloadCount()).toBe(1);
  });

  it("concatenates the stored arrays collected from each branch, by reference", async () => {
    const { storageProvider, getDownloadCount } = createMemoryStorageProvider();

    const branches = await Promise.all([
      storeEntities(storageProvider, generateStepRunId("3.2", 0), [entity(0)]),
      storeEntities(storageProvider, generateStepRunId("3.2", 1), [
        entity(1),
        entity(2),
      ]),
      storeEntities(storageProvider, generateStepRunId("3.2", 2), [entity(3)]),
    ]);

    const collected = branches.reduce<
      ReturnType<typeof appendCollectedValue> | undefined
    >(
      (collectedSoFar, branch) => appendCollectedValue(collectedSoFar, branch),
      undefined,
    ) as ArrayStoredPayloadRef<"ProposedEntity">;

    expect(getDownloadCount()).toBe(0);
    expect(collected).toMatchObject({ array: true, length: 4 });

    /* Each append flattens the concatenation so far, so the reference doesn't nest deeper with every branch. */
    expect("parts" in collected && collected.parts).toEqual(branches);

    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId },
        "ProposedEntity",
        collected,
      ),
    ).resolves.toEqual([entity(0), entity(1), entity(2), entity(3)]);

    const items = getArrayPayloadItems(collected);

    /* Each item points at the branch's array that holds it, with its index there, not at the concatenation. */
    expect(items).toEqual([
      expect.objectContaining({ of: branches[0], index: 0 }),
      expect.objectContaining({ of: branches[1], index: 0 }),
      expect.objectContaining({ of: branches[1], index: 1 }),
      expect.objectContaining({ of: branches[2], index: 0 }),
    ]);
  });

  it("resolves an item of a concatenation by downloading only the array that holds it", async () => {
    const { storageProvider, getDownloadCount } = createMemoryStorageProvider();

    const branches = await Promise.all([
      storeEntities(storageProvider, generateStepRunId("3.2", 0), [entity(0)]),
      storeEntities(storageProvider, generateStepRunId("3.2", 1), [
        entity(1),
        entity(2),
      ]),
    ]);

    const collected = appendCollectedValue(
      appendCollectedValue(undefined, branches[0]),
      branches[1],
    );

    const [, , lastItemOfSecondBranch] = getArrayPayloadItems(collected);

    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId },
        "ProposedEntity",
        lastItemOfSecondBranch as SingularStoredPayloadRef<"ProposedEntity">,
      ),
    ).resolves.toEqual(entity(2));
    expect(getDownloadCount()).toBe(1);
  });

  it("gathers inline values collected from each branch", () => {
    expect(
      appendCollectedValue(appendCollectedValue(undefined, "a"), ["b", "c"]),
    ).toEqual(["a", "b", "c"]);
  });

  it("refuses to mix stored and inline arrays when collecting", async () => {
    const { storageProvider } = createMemoryStorageProvider();

    const stored = await storeEntities(
      storageProvider,
      generateStepRunId("3.2", 0),
      [entity(0)],
    );

    expect(() => appendCollectedValue([entity(1)], stored)).toThrow();
    expect(() => appendCollectedValue(stored, [entity(1)])).toThrow();
  });

  it("resolves item references inside an inline array", async () => {
    const { storageProvider } = createMemoryStorageProvider();

    const persisted: PersistedEntityMetadata[] = [
      { entityId: entityId(0), operation: "create" },
      { entityId: entityId(1), operation: "create" },
    ];

    const ref = await storePayload({
      storageProvider,
      workflowId,
      runId: `run-${Math.random()}`,
      stepId: "persist",
      outputName: "persistedEntities",
      kind: "PersistedEntityMetadata",
      value: persisted,
    });

    /* A for-each branch puts its item into an array for an input that takes one. */
    const [, secondItem] = getArrayPayloadItems(ref);

    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId },
        "PersistedEntityMetadata",
        [secondItem as StoredItemRef<"PersistedEntityMetadata">],
      ),
    ).resolves.toEqual([persisted[1]]);
  });

  it("fails to resolve an item that isn't in its array", async () => {
    const { storageProvider } = createMemoryStorageProvider();

    const ref = await storeEntities(storageProvider, "persist", [entity(0)]);

    await expect(
      resolvePayloadValue({ storageProvider, workflowId }, "ProposedEntity", {
        __stored: true,
        kind: "ProposedEntity",
        array: false,
        of: ref,
        index: 1,
      }),
    ).rejects.toThrow("has no item 1");

    for (const index of [-1, 0.5, Number.NaN]) {
      await expect(
        resolvePayloadValue({ storageProvider, workflowId }, "ProposedEntity", {
          __stored: true,
          kind: "ProposedEntity",
          array: false,
          of: ref,
          index,
        }),
      ).rejects.toThrow(`has no item ${String(index)}`);
    }
  });

  it("downloads again after a failed download", async () => {
    const { storageProvider, getDownloadCount } = createMemoryStorageProvider();

    const ref = await storeEntities(storageProvider, "persist", [entity(0)]);

    const { downloadDirect } = storageProvider;
    storageProvider.downloadDirect = () =>
      Promise.reject(new Error("Network error"));

    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId },
        "ProposedEntity",
        ref,
      ),
    ).rejects.toThrow("Network error");

    storageProvider.downloadDirect = downloadDirect;

    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId },
        "ProposedEntity",
        ref,
      ),
    ).resolves.toEqual([entity(0)]);
    expect(getDownloadCount()).toBe(1);
  });

  it("gives each read its own copy of a cached download", async () => {
    const { storageProvider, getDownloadCount } = createMemoryStorageProvider();

    const ref = await storeEntities(storageProvider, "persist", [entity(0)]);

    const firstRead = await resolvePayloadValue(
      { storageProvider, workflowId },
      "ProposedEntity",
      ref,
    );
    firstRead.push(entity(1));

    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId },
        "ProposedEntity",
        ref,
      ),
    ).resolves.toEqual([entity(0)]);
    expect(getDownloadCount()).toBe(1);
  });

  it("keeps only the most recent downloads", async () => {
    const { storageProvider, getDownloadCount } = createMemoryStorageProvider();

    /* One more than the cache holds, so the first is dropped. */
    const refs = await Promise.all(
      Array.from({ length: 21 }, (_, index) =>
        storeEntities(storageProvider, `step-${index}`, [entity(index)]),
      ),
    );

    for (const ref of refs) {
      await resolvePayloadValue(
        { storageProvider, workflowId },
        "ProposedEntity",
        ref,
      );
    }

    expect(getDownloadCount()).toBe(21);

    await resolvePayloadValue(
      { storageProvider, workflowId },
      "ProposedEntity",
      refs[20]!,
    );
    expect(getDownloadCount()).toBe(21);

    await resolvePayloadValue(
      { storageProvider, workflowId },
      "ProposedEntity",
      refs[0]!,
    );
    expect(getDownloadCount()).toBe(22);
  });

  it("only resolves the outputs of its own workflow", async () => {
    const { storageProvider, getDownloadCount } = createMemoryStorageProvider();

    const ref = await storeEntities(storageProvider, "persist", [entity(0)]);

    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId: "another-workflow" },
        "ProposedEntity",
        ref,
      ),
    ).rejects.toThrow("is not an output of workflow another-workflow");

    /* A workflow id that the reference's workflow id starts with. */
    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId: "work" },
        "ProposedEntity",
        ref,
      ),
    ).rejects.toThrow("is not an output of workflow work");

    await expect(
      resolvePayloadValue({ storageProvider, workflowId }, "ProposedEntity", {
        ...ref,
        storageKey: `flows/${workflowId}/../another-workflow/run/persist/proposedEntities.json`,
      }),
    ).rejects.toThrow("is not an output of workflow");

    /* The check applies inside item and concatenation references too. */
    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId: "another-workflow" },
        "ProposedEntity",
        getArrayPayloadItems(
          ref,
        )[0] as SingularStoredPayloadRef<"ProposedEntity">,
      ),
    ).rejects.toThrow("is not an output of workflow another-workflow");

    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId: "another-workflow" },
        "ProposedEntity",
        appendCollectedValue(
          undefined,
          ref,
        ) as ArrayStoredPayloadRef<"ProposedEntity">,
      ),
    ).rejects.toThrow("is not an output of workflow another-workflow");

    expect(getDownloadCount()).toBe(0);
  });

  it("fails to resolve a concatenation with a part that isn't a stored array", async () => {
    const { storageProvider } = createMemoryStorageProvider();

    const [first, second] = await Promise.all([
      storeEntities(storageProvider, "branch-0", [entity(0)]),
      storeEntities(storageProvider, "branch-1", [entity(1)]),
    ]);

    /* Flattened with the other part, a single entity would pass as an item of the array. */
    await storageProvider.uploadDirect({
      key: second.storageKey,
      body: JSON.stringify(entity(1)),
      contentType: "application/json",
    });

    await expect(
      resolvePayloadValue(
        { storageProvider, workflowId },
        "ProposedEntity",
        appendCollectedValue(
          appendCollectedValue(undefined, first),
          second,
        ) as ArrayStoredPayloadRef<"ProposedEntity">,
      ),
    ).rejects.toThrow(
      "A concatenation has a part that is a stored value that isn't an array",
    );
  });
});

describe("checking values against their kind's schema", () => {
  it("refuses to store an invalid value, saying where it's invalid, without a retry", async () => {
    const { storageProvider, getObjectCount } = createMemoryStorageProvider();

    const storing = storeEntities(storageProvider, "persist", [
      entity(0),
      { ...entity(1), entityTypeIds: [] } as unknown as ProposedEntity,
    ]);

    await expect(storing).rejects.toThrow(
      'Can\'t store output "proposedEntities", which is invalid at [1].entityTypeIds: ',
    );
    await expect(storing).rejects.toMatchObject({ nonRetryable: true });
    expect(getObjectCount()).toBe(0);
  });
});

describe("payloads whose kind is only known when an action runs", () => {
  const output = (
    storageProvider: FileStorageProvider,
    outputName: string,
  ) => ({
    storageProvider,
    workflowId,
    runId: `run-${Math.random()}`,
    stepId: "generic",
    outputName,
  });

  it("stores an output only if its kind requires it", async () => {
    const { storageProvider } = createMemoryStorageProvider();

    const persisted = {
      entityId: entityId(0),
      operation: "create",
    } as const;

    const [proposed, persistedArray, persistedSingle, texts] =
      await Promise.all([
        prepareOutputPayload({
          ...output(storageProvider, "proposed"),
          payload: { kind: "ProposedEntity", value: entity(0) },
        }),
        prepareOutputPayload({
          ...output(storageProvider, "persistedArray"),
          payload: { kind: "PersistedEntityMetadata", value: [persisted] },
        }),
        prepareOutputPayload({
          ...output(storageProvider, "persistedSingle"),
          payload: { kind: "PersistedEntityMetadata", value: persisted },
        }),
        prepareOutputPayload({
          ...output(storageProvider, "texts"),
          payload: { kind: "Text", value: ["a", "b"] },
        }),
      ]);

    /* A stored kind is always stored, and a stored-array kind only as an array. */
    expect(proposed.value).toMatchObject({ __stored: true, array: false });
    expect(persistedArray.value).toMatchObject({
      __stored: true,
      array: true,
      length: 1,
    });
    expect(persistedSingle).toEqual({
      kind: "PersistedEntityMetadata",
      value: persisted,
    });
    expect(texts).toEqual({ kind: "Text", value: ["a", "b"] });
  });

  /*
   * `find` and `filter` as actions implement them, generic over the kind their items are given. What this checks is
   * mostly that they compile without a cast, and that a mistake in the kind they return doesn't.
   */
  type ItemsInput = {
    readonly name: "items";
    readonly oneOfPayloadKinds: readonly ["Text", "ProposedEntity"];
    readonly array: true;
    readonly required: true;
  };

  type FindAction = {
    readonly inputs: readonly [ItemsInput];
    readonly outputs: readonly [
      {
        readonly name: "match";
        readonly kindFrom: "items";
        readonly array: false;
        readonly required: false;
      },
    ];
  };

  type FilterAction = {
    readonly inputs: readonly [ItemsInput];
    readonly outputs: readonly [
      {
        readonly name: "matches";
        readonly kindFrom: "items";
        readonly array: true;
        readonly required: true;
      },
    ];
  };

  type Implementation<Definition extends ActionDefinitionTypes> = <
    Kinds extends InputKindsOf<Definition>,
  >(
    inputs: SimplifiedInputsOf<Definition, Kinds>,
  ) => Promise<StepOutputOf<Definition, Kinds>[]>;

  const find =
    (
      storageProvider: FileStorageProvider,
      isMatch: (item: unknown) => boolean,
    ): Implementation<FindAction> =>
    async ({ items }) => {
      const resolved = await resolveInputPayload(
        { storageProvider, workflowId },
        items,
      );

      const match = resolved.value.find(isMatch);

      return match === undefined
        ? []
        : [
            {
              outputName: "match",
              payload: await prepareOutputPayload({
                ...output(storageProvider, "match"),
                payload: { kind: resolved.kind, value: match },
              }),
            },
          ];
    };

  const filter =
    (
      storageProvider: FileStorageProvider,
      isMatch: (item: unknown) => boolean,
    ): Implementation<FilterAction> =>
    async ({ items }) => {
      const resolved = await resolveInputPayload(
        { storageProvider, workflowId },
        items,
      );

      return [
        {
          outputName: "matches",
          payload: await prepareOutputPayload({
            ...output(storageProvider, "matches"),
            payload: {
              kind: resolved.kind,
              value: resolved.value.filter(isMatch),
            },
          }),
        },
      ];
    };

  it("lets an action return items of the kind its input was given", async () => {
    const { storageProvider } = createMemoryStorageProvider();

    const entities = await storeEntities(storageProvider, "persist", [
      entity(0),
      entity(1),
    ]);

    const isEntityOne = (item: unknown) =>
      (item as ProposedEntity).localEntityId === "entity-1";

    const [found] = await find(
      storageProvider,
      isEntityOne,
    )({ items: { kind: "ProposedEntity", value: entities } });

    expect(found?.payload.kind).toBe("ProposedEntity");
    await expect(
      resolveInputPayload({ storageProvider, workflowId }, found!.payload),
    ).resolves.toEqual({ kind: "ProposedEntity", value: entity(1) });

    await expect(
      find(
        storageProvider,
        () => false,
      )({ items: { kind: "ProposedEntity", value: entities } }),
    ).resolves.toEqual([]);

    await expect(
      filter(
        storageProvider,
        (item) => item !== "b",
      )({ items: { kind: "Text", value: ["a", "b", "c"] } }),
    ).resolves.toEqual([
      { outputName: "matches", payload: { kind: "Text", value: ["a", "c"] } },
    ]);
  });

  it("rejects an output of another kind, or of values not of its kind", () => {
    const storageProvider = createMemoryStorageProvider().storageProvider;

    // @ts-expect-error -- the output takes its kind from `items`, which may not be `Text`
    const _anotherKind: Implementation<FilterAction> = async () => [
      {
        outputName: "matches",
        payload: await prepareOutputPayload({
          ...output(storageProvider, "matches"),
          payload: { kind: "Text", value: ["a"] },
        }),
      },
    ];

    const _valuesOfAnotherKind: Implementation<FilterAction> = async ({
      items,
    }) => [
      {
        outputName: "matches",
        payload: await prepareOutputPayload({
          ...output(storageProvider, "matches"),
          // @ts-expect-error -- strings are only values of `items`' kind if it's `Text`
          payload: { kind: items.kind, value: ["a"] },
        }),
      },
    ];
  });
});
