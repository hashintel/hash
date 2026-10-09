import { describe, expect, it } from "vitest";

import {
  appendCollectedValue,
  getArrayPayloadItems,
  getArrayPayloadLength,
} from "@local/hash-isomorphic-utils/flows/stored-payload-refs";

import {
  resolvePayloadValue,
  prepareOutputPayload,
  storePayload,
} from "./payload-storage.js";

import type { FileStorageProvider } from "../file-storage.js";
import type { EntityId } from "@blockprotocol/type-system";
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
  };
};

/**
 * A stand-in for a proposed entity: storage doesn't look inside the values it stores.
 */
const entity = (index: number) =>
  ({ localEntityId: `entity-${index}` }) as unknown as ProposedEntity;

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
      storeEntities(storageProvider, "3.2~0", [entity(0)]),
      storeEntities(storageProvider, "3.2~1", [entity(1), entity(2)]),
      storeEntities(storageProvider, "3.2~2", [entity(3)]),
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
      storeEntities(storageProvider, "3.2~0", [entity(0)]),
      storeEntities(storageProvider, "3.2~1", [entity(1), entity(2)]),
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

    const stored = await storeEntities(storageProvider, "3.2~0", [entity(0)]);

    expect(() => appendCollectedValue([entity(1)], stored)).toThrow();
    expect(() => appendCollectedValue(stored, [entity(1)])).toThrow();
  });

  it("resolves item references inside an inline array", async () => {
    const { storageProvider } = createMemoryStorageProvider();

    const persisted: PersistedEntityMetadata[] = [
      { entityId: "web~entity-0" as EntityId, operation: "create" },
      { entityId: "web~entity-1" as EntityId, operation: "create" },
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
      entityId: "web~entity-0" as EntityId,
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
});
