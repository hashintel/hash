/**
 * The prototype's data: every flow (seeded, then what you make and edit) and each flow's runs. One store for the
 * whole page, kept on `globalThis`, so a hot update of any component leaves it as it was.
 *
 * Flows persist to localStorage under one versioned key, debounced; a reload restores them. Runs are kept in
 * memory only: a reload starts the demo's Run 17 again, live.
 */
import { useSyncExternalStore } from "react";

import {
  liveRun17,
  newLiveRun,
  pastRuns,
  type RunRecord,
  runClock,
} from "./run-history";
import {
  type FlowEntry,
  monthlyReviewId,
  newFlowEntry,
  seedFlows,
} from "./seed-flows";

import type { EditorDocument } from "./document";

const storageKey = "flows-proto:v1";

type Persisted = { version: 1; flows: FlowEntry[] };

type State = {
  flows: FlowEntry[];
  runs: Record<string, RunRecord[]>;
};

type Store = {
  state: State;
  listeners: Set<() => void>;
  saveTimer?: ReturnType<typeof setTimeout>;
};

const load = (): FlowEntry[] => {
  try {
    const raw = globalThis.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed.version === 1 && Array.isArray(parsed.flows)) {
        return parsed.flows;
      }
    }
  } catch {
    // Private windows and blocked storage: start from the seeds.
  }
  return seedFlows();
};

/**
 * Run 17 opens a few seconds in and runs on its own. A screen link can hold it at a moment instead:
 * `?at=62&pin` (J6.2) or start it at a moment (`?at=62`).
 */
const seedRuns = (): Record<string, RunRecord[]> => {
  const query = new URLSearchParams(globalThis.location.search);
  const at = query.get("at");
  return {
    [monthlyReviewId]: [
      liveRun17(Date.now(), {
        seconds: at === null ? 4 : Number(at),
        pinned: query.has("pin"),
      }),
      ...pastRuns(),
    ],
  };
};

const holder = globalThis as typeof globalThis & { flowsProtoStore?: Store };

holder.flowsProtoStore ??= {
  state: { flows: load(), runs: seedRuns() },
  listeners: new Set(),
};
const store: Store = holder.flowsProtoStore;

const emit = () => {
  for (const listener of store.listeners) {
    listener();
  }
};

const save = () => {
  clearTimeout(store.saveTimer);
  store.saveTimer = setTimeout(() => {
    try {
      const persisted: Persisted = { version: 1, flows: store.state.flows };
      globalThis.localStorage.setItem(storageKey, JSON.stringify(persisted));
    } catch {
      // Full or blocked storage: the session keeps working, unsaved.
    }
  }, 300);
};

const setState = (update: (state: State) => State, persist: boolean) => {
  store.state = update(store.state);
  if (persist) {
    save();
  }
  emit();
};

const subscribe = (listener: () => void) => {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
};

export const useAppState = () =>
  useSyncExternalStore(subscribe, () => store.state);

export const getFlow = (id: string) =>
  store.state.flows.find((flow) => flow.id === id);

export const updateDocument = (
  id: string,
  update: (document: EditorDocument) => EditorDocument,
) =>
  setState(
    (state) => ({
      ...state,
      flows: state.flows.map((flow) =>
        flow.id === id
          ? {
              ...flow,
              document: update(flow.document),
              meta: { ...flow.meta, updated: "Just now" },
            }
          : flow,
      ),
    }),
    true,
  );

/** New flow: a draft with Start only, first in the list. Returns its id. */
export const createFlow = () => {
  const taken = new Set(store.state.flows.map((flow) => flow.id));
  let index = 1;
  while (taken.has(`untitled-flow-${index}`)) {
    index += 1;
  }
  const id = `untitled-flow-${index}`;
  setState(
    (state) => ({ ...state, flows: [newFlowEntry(id), ...state.flows] }),
    true,
  );
  return id;
};

export const archiveFlow = (id: string) =>
  setState(
    (state) => ({
      ...state,
      flows: state.flows.filter((flow) => flow.id !== id),
    }),
    true,
  );

/* ----------------------------------------------------------------------------------------------------------------
 * Viewports
 * ------------------------------------------------------------------------------------------------------------- */

/** Where each flow's editor canvas was last panned and zoomed, so a reload opens it where it was left. */
export type SavedViewport = { x: number; y: number; zoom: number };

const viewportKey = "flows-proto:viewports:v1";

const viewports: Record<string, SavedViewport> = (() => {
  try {
    const raw = globalThis.localStorage.getItem(viewportKey);
    return raw ? (JSON.parse(raw) as Record<string, SavedViewport>) : {};
  } catch {
    return {};
  }
})();

let viewportTimer: ReturnType<typeof setTimeout> | undefined;

export const getViewport = (flowId: string): SavedViewport | undefined =>
  viewports[flowId];

export const saveViewport = (flowId: string, viewport: SavedViewport) => {
  viewports[flowId] = viewport;
  clearTimeout(viewportTimer);
  viewportTimer = setTimeout(() => {
    try {
      globalThis.localStorage.setItem(viewportKey, JSON.stringify(viewports));
    } catch {
      // Blocked storage: the viewport is kept for this page only.
    }
  }, 300);
};

/** Dev: back to the seeded workspace (behind the ⌘K jumper). */
export const resetDemoData = () => {
  try {
    globalThis.localStorage.removeItem(storageKey);
    globalThis.localStorage.removeItem(viewportKey);
  } catch {
    // Nothing stored.
  }
  for (const flowId of Object.keys(viewports)) {
    delete viewports[flowId];
  }
  setState(() => ({ flows: seedFlows(), runs: seedRuns() }), false);
};

/* ----------------------------------------------------------------------------------------------------------------
 * Runs
 * ------------------------------------------------------------------------------------------------------------- */

const noRuns: RunRecord[] = [];

export const runsOf = (state: State, flowId: string) =>
  state.runs[flowId] ?? noRuns;

/** A new live run of a flow, newest first. Returns its id. */
export const startRun = (flowId: string, items?: number) => {
  const runs = runsOf(store.state, flowId);
  const id = runs.reduce((max, run) => Math.max(max, run.id), 0) + 1;
  setState(
    (state) => ({
      ...state,
      runs: {
        ...state.runs,
        [flowId]: [newLiveRun(id, Date.now(), items), ...runsOf(state, flowId)],
      },
    }),
    false,
  );
  return id;
};

export const stopRun = (flowId: string, runId: number) => {
  const at = Date.now();
  const date = new Date(at);
  const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  setState(
    (state) => ({
      ...state,
      runs: {
        ...state.runs,
        [flowId]: runsOf(state, flowId).map((run) =>
          run.id === runId && run.kind === "live"
            ? { ...run, stopped: { at: runClock(run, at), clock } }
            : run,
        ),
      },
    }),
    false,
  );
};
