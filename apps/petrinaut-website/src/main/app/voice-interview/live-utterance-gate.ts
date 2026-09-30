import { logLiveDiagnostic } from "./shared/live-diagnostic";

import type {
  UtteranceJudgment,
  UtteranceJudgmentState,
} from "../../../shared/live-utterance-judgment";

export interface WithheldUtterance {
  readonly id: string;
  readonly text: string;
}

interface Entry {
  readonly input: WithheldUtterance;
  decision: "pending" | "submit" | "withhold";
}

interface Dependencies {
  readonly judge?: (
    state: UtteranceJudgmentState,
    signal: AbortSignal,
  ) => Promise<UtteranceJudgment | null>;
  readonly canSubmit: () => boolean;
  readonly submit: (input: WithheldUtterance) => void;
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

  public accept(input: WithheldUtterance, state: UtteranceJudgmentState): void {
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
      entry.decision =
        judgment !== null &&
        judgment.confidence >= 0.8 &&
        judgment.contribution !== "interview_content"
          ? "withhold"
          : "submit";
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
      this.drain();
    };
    timer = setTimeout(() => finish(null, true), 1_000);
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

  public cancelPending(): void {
    for (const cancel of this.#cancellations) cancel();
    this.#queue.length = 0;
  }

  public stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.cancelPending();
  }
}
