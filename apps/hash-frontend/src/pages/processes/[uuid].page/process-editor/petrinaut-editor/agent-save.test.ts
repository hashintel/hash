import { expect, test, vi } from "vitest";

import { createAgentSave, type StartEditorSave } from "./agent-save";

import type { SavedSnapshot } from "../petrinaut-editor";
import type { ReadBrunchDocumentSaveState } from "@hashintel/brunch-agent/ui";

const snapshot: NonNullable<SavedSnapshot> = {
  definition: {
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
  },
  title: "Net",
  decisionTime: "2026-10-24T01:00:00.000Z",
};

/** A load, told apart from another by identity. */
type Load = { name: string };

/**
 * An agent save over an editor whose Save starts, for `load`, unless told
 * otherwise. `hostResolves` resolves the host's save, calling `hostSaved`
 * first as the editor does while the load is open; `hostFails` rejects it.
 */
const setup = ({
  refusal = null,
  starts = true,
}: { refusal?: string | null; starts?: boolean } = {}) => {
  const load: Load = { name: "open" };
  const readState = vi.fn<ReadBrunchDocumentSaveState>(() => ({
    title: "Net",
    lastSavedTime: null,
    refusal,
  }));
  const host: {
    hostSaved?: (saved: NonNullable<SavedSnapshot>) => void;
    resolve?: () => void;
    reject?: (error: Error) => void;
  } = {};
  const start = vi.fn<StartEditorSave>((hostSaved) => {
    if (!starts) {
      return null;
    }
    host.hostSaved = hostSaved;
    return new Promise<void>((resolve, reject) => {
      host.resolve = resolve;
      host.reject = reject;
    });
  });
  const agentSave = createAgentSave<Load>();
  const hostSave = agentSave.hostSaveFor(load, { read: readState, start });
  const hostResolves = () => {
    host.hostSaved?.(snapshot);
    host.resolve?.();
  };
  const hostFails = (error: Error) => host.reject?.(error);
  const settles = (signal = new AbortController().signal) => {
    const settled = hostSave.save("web~net", signal);
    const state = { settled: false };
    void settled.then(
      () => {
        state.settled = true;
      },
      () => {
        state.settled = true;
      },
    );
    return { settled, state };
  };
  return {
    agentSave,
    hostFails,
    hostResolves,
    load,
    readState,
    settles,
    start,
  };
};

/** Lets settled promises run their callbacks. */
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

test("a refused save settles as not started with the refusal, and the editor's Save never runs", async () => {
  const { readState, start, settles } = setup({
    refusal: "A save of this net is already in progress.",
  });
  await expect(settles().settled).resolves.toEqual({
    status: "not-started",
    reason: "A save of this net is already in progress.",
  });
  expect(readState).toHaveBeenCalledWith("web~net");
  expect(start).not.toHaveBeenCalled();
});

test("a save the editor's Save didn't start rejects", async () => {
  const { agentSave, load, settles } = setup({ starts: false });
  await expect(settles().settled).rejects.toThrow(
    "The editor did not start the save.",
  );
  expect(agentSave.occupies(load)).toBe(false);
});

test("a save already aborted rejects with the abort's reason before the editor's Save runs", async () => {
  const { start, settles } = setup();
  const controller = new AbortController();
  controller.abort(new Error("Brunch stopped the turn"));
  await expect(settles(controller.signal).settled).rejects.toThrow(
    "Brunch stopped the turn",
  );
  expect(start).not.toHaveBeenCalled();
});

test("a saved result settles once its load commits its snapshot, with the dirty state the editor then shows", async () => {
  const { agentSave, hostResolves, load, settles } = setup();
  const save = settles();
  expect(agentSave.occupies(load)).toBe(true);
  expect(agentSave.occupies({ name: "another" })).toBe(false);
  hostResolves();
  await flush();
  expect(save.state.settled).toBe(false);
  expect(agentSave.occupies(load)).toBe(true);
  // Another snapshot's commit is not this save's.
  agentSave.committed(load, { ...snapshot }, false);
  await flush();
  expect(save.state.settled).toBe(false);

  agentSave.committed(load, snapshot, true);
  await expect(save.settled).resolves.toEqual({
    status: "saved",
    decisionTime: "2026-10-24T01:00:00.000Z",
    title: "Net",
    stillDirty: true,
  });
  expect(agentSave.occupies(load)).toBe(false);
});

test("a failed host save settles as unconfirmed with its error", async () => {
  const { hostFails, settles } = setup();
  const save = settles();
  hostFails(
    new Error("Persist appeared to succeed but the entity wasn't visible"),
  );
  await expect(save.settled).resolves.toEqual({
    status: "unconfirmed",
    error: "Persist appeared to succeed but the entity wasn't visible",
  });
});

type AgentSave = ReturnType<typeof createAgentSave<Load>>;

test.each([
  {
    cause: "commits another load",
    abandon: (agentSave: AgentSave) =>
      agentSave.committed({ name: "next" }, null, false),
    error: "The editor reloaded before the save was confirmed.",
  },
  {
    cause: "closes",
    abandon: (agentSave: AgentSave) => agentSave.abandon("closed"),
    error: "The editor closed before the save was confirmed.",
  },
])(
  "an editor that $cause before the host's save resolves settles the save as unconfirmed, and a late result settles nothing",
  async ({ abandon, error }) => {
    const { agentSave, hostResolves, load, settles } = setup();
    const save = settles();
    abandon(agentSave);
    await expect(save.settled).resolves.toEqual({
      status: "unconfirmed",
      error,
    });
    expect(agentSave.occupies(load)).toBe(false);
    hostResolves();
    agentSave.committed(load, snapshot, false);
    await expect(save.settled).resolves.toEqual({
      status: "unconfirmed",
      error,
    });
  },
);

test("an editor that commits another load after the host's save resolved, before its commit, settles the save as saved and clean", async () => {
  const { agentSave, hostResolves, settles } = setup();
  const save = settles();
  hostResolves();
  await flush();
  agentSave.committed({ name: "next" }, null, true);
  await expect(save.settled).resolves.toEqual({
    status: "saved",
    decisionTime: "2026-10-24T01:00:00.000Z",
    title: "Net",
    stillDirty: false,
  });
});

test("an abort while the save waits rejects with its reason, and its result settles nothing", async () => {
  const { agentSave, hostResolves, load, settles } = setup();
  const controller = new AbortController();
  const save = settles(controller.signal);
  controller.abort(new Error("Brunch stopped the turn"));
  await expect(save.settled).rejects.toThrow("Brunch stopped the turn");
  expect(agentSave.occupies(load)).toBe(false);
  hostResolves();
  agentSave.committed(load, snapshot, false);
  await expect(save.settled).rejects.toThrow("Brunch stopped the turn");
});

test("an abort with no reason of its own rejects as the agent's save aborted", async () => {
  const { settles } = setup();
  const controller = new AbortController();
  const save = settles(controller.signal);
  controller.abort("stopped");
  await expect(save.settled).rejects.toThrow("The agent's save was aborted.");
});
