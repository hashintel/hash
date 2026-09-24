import {
  describeBudget,
  describeExperiment,
} from "../../shared/brunch-draft-experiment-summary";
import { logLiveDiagnostic } from "../shared/live-diagnostic";

import type {
  SessionDraft,
  SessionDraftsState,
} from "../../shared/brunch-draft-experiment-drafts";
import type { PetrinautExperimentResult } from "@hashintel/petrinaut-core";

interface Dependencies {
  readonly appendThinking: (text: string, delegationId: null) => boolean;
  readonly appendCommentary: (
    text: string,
    delegationId: string | null,
  ) => boolean;
}

/** One GPT-Live append is at most 500 tokens; a note stays well inside that. */
const noteLimit = 1_400;

const clip = (text: string) =>
  text.length <= noteLimit ? text : `${text.slice(0, noteLimit - 1)}…`;

const formatValue = (value: number | boolean | null) =>
  value === null
    ? "no value"
    : typeof value === "boolean"
      ? String(value)
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(2);

/** What the person can be told once the run has ended, in one breath. */
export const describeExperimentResult = (
  result: PetrinautExperimentResult,
): string => {
  const runs = `${result.runsCompleted} ${result.runsCompleted === 1 ? "run" : "runs"}`;
  if (result.status === "cancelled") {
    return `The experiment "${result.name}" was cancelled after ${runs}. There is no result to report.`;
  }
  if (result.status === "error") {
    return `The experiment "${result.name}" stopped with an error after ${runs}${result.message ? `: ${result.message}` : ""}. There is no result to report.`;
  }
  const metrics = result.metrics
    .map((metric) => `${metric.label} ${formatValue(metric.value)}`)
    .join(", ");
  const best = result.optimization
    ? ` Best setting found: ${Object.entries(result.optimization.parameters)
        .map(([identifier, value]) => `${identifier} = ${formatValue(value)}`)
        .join(
          ", ",
        )} (objective ${formatValue(result.optimization.objectiveValue)}, ${result.optimization.stepsCompleted} steps).`
    : "";
  return `The experiment "${result.name}" finished after ${runs}.${best}${metrics ? ` Metrics: ${metrics}.` : ""}`;
};

type Note = {
  /** One note per draft per state; the key names the state. */
  readonly key: string;
  readonly kind: "thinking" | "commentary";
  readonly text: string;
};

const noteFor = (
  draft: SessionDraft,
  options: { readonly current: boolean; readonly replaces: boolean },
): Note | null => {
  const id = draft.toolCallId;
  if (draft.dismissed) {
    return {
      key: `${id}:dismissed`,
      kind: "thinking",
      text: "The person dismissed the drafted experiment card. It will not run unless Brunch drafts again.",
    };
  }
  if (draft.prepared === null) {
    return {
      key: `${id}:invalid`,
      kind: "thinking",
      text: clip(
        `Brunch drafted an experiment, but the browser could not prepare it: ${draft.invalid ?? "unknown reason"}. Nothing runs until Brunch drafts again.`,
      ),
    };
  }
  const summary = `${describeExperiment(draft.prepared, draft.definition)} ${describeBudget(draft.prepared.request)}`;
  switch (draft.run.phase) {
    case "idle":
      return options.current
        ? {
            key: `${id}:drafted`,
            kind: "thinking",
            text: clip(
              `Brunch drafted an experiment for this session. It has not run. ${summary}${options.replaces ? " It replaces the earlier draft." : ""} The person starts it from the card in the assistant panel; do not say it is running or finished until told.`,
            ),
          }
        : null;
    case "running":
      return {
        key: `${id}:running`,
        kind: "thinking",
        text: clip(
          `The person started the drafted experiment. It is running now; results are not in yet. ${summary}`,
        ),
      };
    case "finished":
      return {
        key: `${id}:finished:${draft.run.result.experimentId ?? ""}`,
        kind:
          draft.run.result.status === "complete" ? "commentary" : "thinking",
        text: clip(describeExperimentResult(draft.run.result)),
      };
    case "failed":
      return {
        key: `${id}:failed`,
        kind: "thinking",
        text: clip(
          `The drafted experiment failed to run: ${draft.run.message}. Do not report a result.`,
        ),
      };
  }
};

/**
 * Tells GPT-Live what the experiment card is doing, so the voice can answer
 * "is it running?" or read out a result without Brunch in the loop. Drafts,
 * runs and failures are quiet context; a completed result is spoken, since
 * the person is waiting for it. Nothing here starts a run.
 */
export class ExperimentVoiceRelay {
  readonly #dependencies: Dependencies;
  readonly #offered = new Set<string>();
  #primed = false;
  #currentToolCallId: string | null = null;
  #stopped = false;

  public constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }

  public stop(): void {
    this.#stopped = true;
  }

  public update(state: SessionDraftsState): void {
    if (this.#stopped) return;
    if (!this.#primed) {
      // History from before this voice session is context, never news: a
      // result that finished an hour ago must not be read out on connect.
      for (const draft of state.drafts.values()) {
        const note = noteFor(draft, { current: false, replaces: false });
        if (note && draft.toolCallId !== state.currentToolCallId)
          this.#offered.add(note.key);
      }
      this.#currentToolCallId = state.currentToolCallId;
      this.#primed = true;
      const current =
        state.currentToolCallId === null
          ? undefined
          : state.drafts.get(state.currentToolCallId);
      if (current) {
        const note = noteFor(current, { current: true, replaces: false });
        if (note) this.#send({ ...note, kind: "thinking" });
      }
      return;
    }
    const replaces =
      state.currentToolCallId !== null &&
      this.#currentToolCallId !== null &&
      state.currentToolCallId !== this.#currentToolCallId;
    this.#currentToolCallId = state.currentToolCallId;
    for (const draft of state.drafts.values()) {
      const current = draft.toolCallId === state.currentToolCallId;
      const note = noteFor(draft, { current, replaces: current && replaces });
      if (note) this.#send(note);
    }
  }

  #send(note: Note): void {
    if (this.#offered.has(note.key)) return;
    const sent =
      note.kind === "commentary"
        ? this.#dependencies.appendCommentary(note.text, null)
        : this.#dependencies.appendThinking(note.text, null);
    logLiveDiagnostic("experiment.note", {
      key: note.key,
      kind: note.kind,
      characters: note.text.length,
      sent,
    });
    // A failed local send (channel not yet open) is retried on the next update.
    if (sent) this.#offered.add(note.key);
  }
}
