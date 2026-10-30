// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  createEntityMutation,
  updateEntityMutation,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { useProcessSaveAndLoad } from "./use-process-save-and-load";

import type { PersistedNet } from "../../../processes.page/use-persisted-nets";
import type * as ApolloClient from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";
import type { SDCPN } from "@hashintel/petrinaut";
import type { DocumentNode } from "graphql";

type RefetchResult = { data: { nets: PersistedNet[] } };

type UpdateEntityOptions = {
  variables: { entityUpdate: { entityId: EntityId } };
};

const mocks = vi.hoisted(() => ({
  createEntity: vi.fn(),
  updateEntity:
    vi.fn<(options: UpdateEntityOptions) => Promise<{ data: object }>>(),
  refetch: vi.fn(),
}));

vi.mock("@apollo/client", async (importOriginal) => {
  const original = await importOriginal<typeof ApolloClient>();
  return {
    ...original,
    useMutation: (mutation: DocumentNode) => [
      mutation === createEntityMutation
        ? mocks.createEntity
        : mutation === updateEntityMutation
          ? mocks.updateEntity
          : vi.fn(),
    ],
  };
});

vi.mock("../../../processes.page/use-persisted-nets", () => ({
  usePersistedNets: () => ({
    persistedNets: [],
    loading: false,
    refetch: mocks.refetch,
  }),
  getPersistedNetsFromSubgraph: (data: RefetchResult["data"]) => data.nets,
}));

vi.mock("../../../shared/workspace-context", () => ({
  useActiveWorkspace: () => ({ activeWorkspaceWebId: "web-alice" }),
}));

vi.mock("@local/hash-graph-sdk/entity", () => ({
  HashEntity: class {
    entityId: EntityId;
    constructor(entity: { entityId: EntityId }) {
      this.entityId = entity.entityId;
    }
  },
}));

const definition = (label: string): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [{ id: label } as SDCPN["parameters"][number]],
});

const makeNet = (
  entityId: string,
  userEditable: boolean,
  lastUpdated = "2026-01-01T00:00:00.000Z",
): PersistedNet => ({
  entityId: entityId as EntityId,
  title: entityId,
  definition: definition(entityId),
  userEditable,
  lastUpdated,
});

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

/** Holds `selectedNetId` in state, as `ProcessEditor` does. */
const renderSaveAndLoad = () =>
  renderHook(() => {
    const [selectedNetId, setSelectedNetId] = useState<EntityId | null>(null);
    const saveAndLoad = useProcessSaveAndLoad({
      selectedNetId,
      setSelectedNetId,
      refetchRevisions: () => Promise.resolve(),
    });
    return { ...saveAndLoad, selectedNetId };
  });

const updatedEntityIds = () =>
  mocks.updateEntity.mock.calls.map(
    ([options]) => options.variables.entityUpdate.entityId,
  );

describe("useProcessSaveAndLoad", () => {
  it("keeps a net loaded during an earlier net's save selected for the next save", async () => {
    mocks.updateEntity.mockReset().mockResolvedValue({ data: {} });
    mocks.refetch.mockReset();

    const netX = makeNet("web-alice~x", true);
    const netY = makeNet("web-alice~y", false);
    const netXAfterSave = makeNet(
      "web-alice~x",
      true,
      "2026-01-02T00:00:00.000Z",
    );

    const lateRefetch = deferred<RefetchResult>();
    mocks.refetch.mockReturnValueOnce(lateRefetch.promise);

    const { result } = renderSaveAndLoad();

    act(() => {
      result.current.loadPersistedNet(netX);
    });

    let saveX: Promise<unknown> = Promise.resolve();
    act(() => {
      saveX = result.current.persistDefinition(definition("x2"), "X");
    });

    act(() => {
      result.current.loadPersistedNet(netY);
    });

    await act(async () => {
      lateRefetch.resolve({ data: { nets: [netXAfterSave, netY] } });
      await saveX;
    });

    mocks.refetch.mockResolvedValueOnce({
      data: { nets: [netXAfterSave, netY] },
    });

    await act(async () => {
      await result.current.persistDefinition(definition("y2"), "Y");
    });

    expect(updatedEntityIds()).toEqual([netX.entityId, netY.entityId]);
    expect(result.current.selectedNetId).toBe(netY.entityId);
    expect(result.current.userEditable).toBe(false);
  });

  it("selects the newly created net on a draft's first save", async () => {
    mocks.createEntity.mockReset();
    mocks.updateEntity.mockReset();
    mocks.refetch.mockReset();

    const created = makeNet("web-alice~new", true);
    mocks.createEntity.mockResolvedValue({
      data: { createEntity: { entityId: created.entityId } },
    });
    mocks.refetch.mockResolvedValue({ data: { nets: [created] } });

    const { result } = renderSaveAndLoad();
    expect(result.current.selectedNetId).toBeNull();

    let persisted: Awaited<
      ReturnType<typeof result.current.persistDefinition>
    > | null = null;
    await act(async () => {
      persisted = await result.current.persistDefinition(
        definition("new"),
        "New",
      );
    });

    expect(persisted).toEqual({
      entityId: created.entityId,
      decisionTime: created.lastUpdated,
      userEditable: true,
    });
    expect(result.current.selectedNetId).toBe(created.entityId);
    expect(result.current.userEditable).toBe(true);
    expect(mocks.updateEntity).not.toHaveBeenCalled();
  });
});
