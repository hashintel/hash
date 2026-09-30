import {
  shouldWithholdUtterance,
  utteranceJudgmentDeadlineMs,
} from "../../../shared/live-utterance-judgment";
import { logLiveDiagnostic } from "./shared/live-diagnostic";

import type {
  UtteranceJudgment,
  UtteranceJudgmentState,
  WithheldContribution,
} from "../../../shared/live-utterance-judgment";
import type { FinalizedInput } from "./live-conversation";

/** Why queued input was discarded: Stop, a Brunch error, or the end of voice. */
export type DiscardReason = "stopped" | "error" | "ended";

interface Entry {
  readonly input: FinalizedInput;
  decision: "pending" | "submit" | "withhold";
}

interface Dependencies {
  readonly judge?: (
    state: UtteranceJudgmentState,
    signal: AbortSignal,
  ) => Promise<UtteranceJudgment | null>;
  readonly canSubmit: () => boolean;
  readonly submit: (input: FinalizedInput) => void;
  /** Called once per withheld input, when its judgment arrives. */
  readonly withhold: (
    input: FinalizedInput,
    contribution: WithheldContribution,
  ) => void;
}

/** Local experiment: owns decisions, never canonical admission. Withheld input is dropped. */
export class LiveUtteranceGate {
  readonly #dependencies: Dependencies;
  readonly #queue: Entry[] = [];
  readonly #cancellations = new Set<() => void>();
  #stopped = false;

  public constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }

  public accept(input: FinalizedInput, state: UtteranceJudgmentState): void {
    if (this.#stopped) return;
    const entry: Entry = { input, decision: "pending" };
    this.#queue.push(entry);
    const controller = new AbortController();
    const startedAt = performance.now();
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const cancel = () => {
      settled = true;
      clearTimeout(timer);
      controller.abort();
      this.#cancellations.delete(cancel);
    };
    const finish = (judgment: UtteranceJudgment | null, timedOut = false) => {
      if (settled || this.#stopped) return;
      settled = true;
      cancel();
      const withheld = shouldWithholdUtterance(judgment)
        ? judgment.contribution
        : null;
      entry.decision = withheld === null ? "submit" : "withhold";
      logLiveDiagnostic("judgment.result", {
        inputId: input.id,
        judgment: judgment !== null,
        contribution: judgment?.contribution ?? null,
        confidence: judgment?.confidence ?? null,
        latencyMs: Math.round(performance.now() - startedAt),
        timedOut,
        decision: entry.decision,
        applied: entry.decision,
        mode: "enforce",
      });
      if (withheld !== null) this.#dependencies.withhold(input, withheld);
      this.drain();
    };
    timer = setTimeout(() => finish(null, true), utteranceJudgmentDeadlineMs);
    this.#cancellations.add(cancel);
    try {
      const judgment = this.#dependencies.judge?.(state, controller.signal);
      if (judgment)
        void judgment.then(
          (result) => finish(result),
          () => finish(null),
        );
      else finish(null);
    } catch {
      finish(null);
    }
  }

  public drain(): void {
    if (this.#stopped) return;
    while (this.#queue[0]?.decision === "withhold") this.#queue.shift();
    const entry = this.#queue[0];
    if (entry?.decision !== "submit" || !this.#dependencies.canSubmit()) return;
    this.#queue.shift();
    this.#dependencies.submit(entry.input);
  }

  /** Discards inputs awaiting judgment or admission; withheld ones were already reported. */
  public cancelPending(reason: DiscardReason): void {
    for (const cancel of this.#cancellations) cancel();
    for (const { input, decision } of this.#queue) {
      if (decision === "withhold") continue;
      logLiveDiagnostic("input.dropped", {
        inputId: input.id,
        reason,
        decision,
      });
    }
    this.#queue.length = 0;
  }

  public stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.cancelPending("ended");
  }
}
