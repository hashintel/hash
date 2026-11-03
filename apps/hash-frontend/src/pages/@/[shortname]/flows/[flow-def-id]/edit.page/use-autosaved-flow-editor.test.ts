// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  autosaveDelayMs,
  FlowChangedElsewhereError,
  FlowSaveRefusedError,
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

type EditorOptions = Parameters<typeof useAutosavedFlowEditor>[0];

const renderEditor = ({
  saveFlowDefinition,
  reloadFlow = vi.fn(),
  onLeftUnsaved,
}: Pick<EditorOptions, "saveFlowDefinition"> &
  Partial<Pick<EditorOptions, "reloadFlow" | "onLeftUnsaved">>) => {
  const { result, unmount } = renderHook(() =>
    useAutosavedFlowEditor({
      flow: {
        flowDefinition: emptyFlow("Flow"),
        editionId: editionId("edition-1"),
        userCanUpdate: true,
      },
      saveFlowDefinition,
      reloadFlow,
      onLeftUnsaved,
    }),
  );

  const addStep = (stepId: string) =>
    act(() => {
      result.current.editor.addStep(stepId, { position: { x: 0, y: 0 } });
    });

  return { result, addStep, unmount };
};

/** Whether leaving the page now would make the browser ask first. */
const leavingIsConfirmed = () =>
  !window.dispatchEvent(new Event("beforeunload", { cancelable: true }));

describe("useAutosavedFlowEditor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a burst of edits once, one save at a time, each against the edition the save before it created", async () => {
    const firstSave = deferred<EntityEditionId>();
    const saveFlowDefinition = vi
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValueOnce(editionId("edition-3"));
    const { result, addStep } = renderEditor({ saveFlowDefinition });

    addStep("first");
    expect(result.current.status).toBe("saving");
    expect(leavingIsConfirmed()).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs / 2));
    addStep("second");
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));
    expect(saveFlowDefinition).toHaveBeenCalledTimes(1);
    expect(stepIdsOf(saveFlowDefinition.mock.calls[0]![0])).toEqual([
      "first",
      "second",
    ]);
    expect(saveFlowDefinition.mock.calls[0]![1]).toBe("edition-1");

    /* An edit while the first save is in flight waits for it. */
    addStep("third");
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs * 3));
    expect(saveFlowDefinition).toHaveBeenCalledTimes(1);

    firstSave.resolve(editionId("edition-2"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(saveFlowDefinition).toHaveBeenCalledTimes(2);
    expect(stepIdsOf(saveFlowDefinition.mock.calls[1]![0])).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(saveFlowDefinition.mock.calls[1]![1]).toBe("edition-2");
    expect(result.current.status).toBe("saved");
    expect(leavingIsConfirmed()).toBe(false);
  });

  it("reloads the flow when it changed elsewhere, retrying a failed reload, and saves the next edit against the reloaded edition", async () => {
    const saveFlowDefinition = vi
      .fn()
      .mockRejectedValueOnce(new FlowChangedElsewhereError())
      .mockRejectedValueOnce(new FlowChangedElsewhereError())
      .mockResolvedValueOnce(editionId("edition-10"));
    const reloadFlow = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        flowDefinition: emptyFlow("Renamed elsewhere"),
        editionId: editionId("edition-9"),
      });
    const { result, addStep } = renderEditor({
      saveFlowDefinition,
      reloadFlow,
    });

    addStep("lost");
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));
    expect(result.current.status).toBe("failed");

    await act(() => result.current.flush());
    expect(reloadFlow).toHaveBeenCalledTimes(2);
    expect(result.current.changedElsewhere).toBe(true);
    expect(result.current.status).toBe("saved");
    expect(result.current.editor.getState().flowDefinition).toEqual(
      emptyFlow("Renamed elsewhere"),
    );

    addStep("kept");
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));
    expect(saveFlowDefinition).toHaveBeenCalledTimes(3);
    expect(saveFlowDefinition.mock.calls[2]![0].name).toBe("Renamed elsewhere");
    expect(stepIdsOf(saveFlowDefinition.mock.calls[2]![0])).toEqual(["kept"]);
    expect(saveFlowDefinition.mock.calls[2]![1]).toBe("edition-9");
  });

  it("shows a failed save, reports it from flush even when accepting refused edits, and tries it again with the next edit against the same edition", async () => {
    const saveFlowDefinition = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(editionId("edition-2"));
    const { result, addStep } = renderEditor({ saveFlowDefinition });

    addStep("first");
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));
    expect(result.current.status).toBe("failed");
    expect(leavingIsConfirmed()).toBe(true);

    let flushed: boolean | undefined;
    await act(async () => {
      flushed = await result.current.flush({ acceptRefusedEdits: true });
    });
    expect(flushed).toBe(false);

    addStep("second");
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));
    expect(saveFlowDefinition).toHaveBeenCalledTimes(3);
    expect(stepIdsOf(saveFlowDefinition.mock.calls[2]![0])).toEqual([
      "first",
      "second",
    ]);
    expect(saveFlowDefinition.mock.calls[2]![1]).toBe("edition-1");
    expect(result.current.status).toBe("saved");
  });

  it("says why the API refused a save until a save succeeds", async () => {
    const reason =
      "This change would stop the flow's active schedules from running it. Pause them first to make it.";
    const saveFlowDefinition = vi
      .fn()
      .mockRejectedValueOnce(new FlowSaveRefusedError(reason))
      .mockResolvedValueOnce(editionId("edition-2"));
    const { result, addStep } = renderEditor({ saveFlowDefinition });

    addStep("first");
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));
    expect(result.current.status).toBe("failed");
    expect(result.current.saveRefusedReason).toBe(reason);

    addStep("second");
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));
    expect(stepIdsOf(saveFlowDefinition.mock.calls[1]![0])).toEqual([
      "first",
      "second",
    ]);
    expect(result.current.status).toBe("saved");
    expect(result.current.saveRefusedReason).toBeNull();
  });

  it("counts refused edits as saved when flushing with acceptRefusedEdits, still retries them, and stops once they're discarded", async () => {
    const saveFlowDefinition = vi
      .fn()
      .mockRejectedValue(new FlowSaveRefusedError("Refused"));
    const onLeftUnsaved = vi.fn();
    const { result, addStep, unmount } = renderEditor({
      saveFlowDefinition,
      onLeftUnsaved,
    });

    addStep("first");
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));

    let flushed: boolean | undefined;
    await act(async () => {
      flushed = await result.current.flush({ acceptRefusedEdits: true });
    });
    expect(flushed).toBe(true);
    expect(saveFlowDefinition).toHaveBeenCalledTimes(2);

    /* E.g. archiving failed after the flush: trying again still sends them. */
    await act(async () => {
      flushed = await result.current.flush();
    });
    expect(flushed).toBe(false);
    expect(saveFlowDefinition).toHaveBeenCalledTimes(3);

    act(() => result.current.discardUnsavedEdits());
    unmount();
    await act(() => vi.runAllTimersAsync());
    expect(saveFlowDefinition).toHaveBeenCalledTimes(3);
    expect(onLeftUnsaved).not.toHaveBeenCalled();
  });

  it("tries to save edits on leaving, and says when they still couldn't be saved", async () => {
    const saveFlowDefinition = vi
      .fn()
      .mockRejectedValue(new Error("Network error"));
    const onLeftUnsaved = vi.fn();
    const { addStep, unmount } = renderEditor({
      saveFlowDefinition,
      onLeftUnsaved,
    });

    addStep("first");
    await act(() => vi.advanceTimersByTimeAsync(autosaveDelayMs));

    unmount();
    await act(() => vi.runAllTimersAsync());
    expect(saveFlowDefinition).toHaveBeenCalledTimes(2);
    expect(onLeftUnsaved).toHaveBeenCalledTimes(1);
  });
});
