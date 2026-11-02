// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  autosaveDelayMs,
  FlowChangedElsewhereError,
  useAutosavedFlowEditor,
} from "./use-autosaved-flow-editor";

import type { EntityEditionId } from "@blockprotocol/type-system";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

const editionId = (id: string) => id as EntityEditionId;

const emptyFlow = (name: string): FlowDefinition<string> => ({
  name,
  description: "",
  inputs: [],
  steps: [],
  outputs: [],
});

/** A promise to settle by hand, to hold a save in flight. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const stepIdsOf = (flowDefinition: FlowDefinition<string>) =>
  flowDefinition.steps.map(({ stepId }) => stepId);

describe("useAutosavedFlowEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves one edit at a time, each against the edition the save before it created", async () => {
    const firstSave = deferred<EntityEditionId>();
    const saveFlowDefinition = vi
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce(editionId("edition-3"));

    const { result } = renderHook(() =>
      useAutosavedFlowEditor({
        flow: {
          flowDefinition: emptyFlow("Flow"),
          editionId: editionId("edition-1"),
        },
        saveFlowDefinition,
        reloadFlow: vi.fn(),
      }),
    );

    act(() => {
      result.current.editor.addStep("first", { position: { x: 0, y: 0 } });
    });
    expect(result.current.status).toBe("saving");

    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));
    expect(saveFlowDefinition).toHaveBeenCalledTimes(1);
    expect(stepIdsOf(saveFlowDefinition.mock.calls[0]![0])).toEqual(["first"]);
    expect(saveFlowDefinition.mock.calls[0]![1]).toBe("edition-1");

    /* An edit while the first save is in flight waits for it. */
    act(() => {
      result.current.editor.addStep("second", { position: { x: 0, y: 0 } });
    });
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs * 3));
    expect(saveFlowDefinition).toHaveBeenCalledTimes(1);

    firstSave.resolve(editionId("edition-2"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(saveFlowDefinition).toHaveBeenCalledTimes(2);
    expect(stepIdsOf(saveFlowDefinition.mock.calls[1]![0])).toEqual([
      "first",
      "second",
    ]);
    expect(saveFlowDefinition.mock.calls[1]![1]).toBe("edition-2");
    expect(result.current.status).toBe("saved");
  });

  it("saves a burst of edits once", async () => {
    const saveFlowDefinition = vi
      .fn()
      .mockResolvedValue(editionId("edition-2"));

    const { result } = renderHook(() =>
      useAutosavedFlowEditor({
        flow: {
          flowDefinition: emptyFlow("Flow"),
          editionId: editionId("edition-1"),
        },
        saveFlowDefinition,
        reloadFlow: vi.fn(),
      }),
    );

    act(() => {
      result.current.editor.addStep("first", { position: { x: 0, y: 0 } });
    });
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs / 2));
    act(() => {
      result.current.editor.addStep("second", { position: { x: 0, y: 0 } });
    });
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));

    expect(saveFlowDefinition).toHaveBeenCalledTimes(1);
    expect(stepIdsOf(saveFlowDefinition.mock.calls[0]![0])).toEqual([
      "first",
      "second",
    ]);
  });

  it("reloads the flow when it changed elsewhere, and saves the next edit against the reloaded edition", async () => {
    const saveFlowDefinition = vi
      .fn()
      .mockRejectedValueOnce(new FlowChangedElsewhereError())
      .mockResolvedValueOnce(editionId("edition-10"));
    const reloadFlow = vi.fn().mockResolvedValue({
      flowDefinition: emptyFlow("Renamed elsewhere"),
      editionId: editionId("edition-9"),
    });

    const { result } = renderHook(() =>
      useAutosavedFlowEditor({
        flow: {
          flowDefinition: emptyFlow("Flow"),
          editionId: editionId("edition-1"),
        },
        saveFlowDefinition,
        reloadFlow,
      }),
    );

    act(() => {
      result.current.editor.addStep("lost", { position: { x: 0, y: 0 } });
    });
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));

    expect(reloadFlow).toHaveBeenCalledTimes(1);
    expect(result.current.changedElsewhere).toBe(true);
    expect(result.current.status).toBe("saved");
    expect(result.current.editor.getState().flowDefinition).toEqual(
      emptyFlow("Renamed elsewhere"),
    );

    act(() => {
      result.current.editor.addStep("kept", { position: { x: 0, y: 0 } });
    });
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));

    expect(saveFlowDefinition).toHaveBeenCalledTimes(2);
    expect(saveFlowDefinition.mock.calls[1]![0].name).toBe("Renamed elsewhere");
    expect(stepIdsOf(saveFlowDefinition.mock.calls[1]![0])).toEqual(["kept"]);
    expect(saveFlowDefinition.mock.calls[1]![1]).toBe("edition-9");
  });

  it("shows a failed save, and tries it again with the next edit against the same edition", async () => {
    const saveFlowDefinition = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(editionId("edition-2"));

    const { result } = renderHook(() =>
      useAutosavedFlowEditor({
        flow: {
          flowDefinition: emptyFlow("Flow"),
          editionId: editionId("edition-1"),
        },
        saveFlowDefinition,
        reloadFlow: vi.fn(),
      }),
    );

    act(() => {
      result.current.editor.addStep("first", { position: { x: 0, y: 0 } });
    });
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));
    expect(result.current.status).toBe("failed");

    act(() => {
      result.current.editor.addStep("second", { position: { x: 0, y: 0 } });
    });
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));

    expect(saveFlowDefinition).toHaveBeenCalledTimes(2);
    expect(stepIdsOf(saveFlowDefinition.mock.calls[1]![0])).toEqual([
      "first",
      "second",
    ]);
    expect(saveFlowDefinition.mock.calls[1]![1]).toBe("edition-1");
    expect(result.current.status).toBe("saved");
  });
});
