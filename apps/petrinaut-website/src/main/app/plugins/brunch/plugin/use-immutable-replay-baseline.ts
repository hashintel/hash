import { useEffect, useEffectEvent, useState } from "react";

type ReplayReadiness<Replay> =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly replay: Replay };

type ReplayBaseline<Snapshot, Replay> = {
  readonly key: string;
  readonly snapshot: Snapshot | undefined;
  readonly readiness: ReplayReadiness<Replay>;
};

type HistoryInput<Snapshot> = {
  readonly bindingKey: string | undefined;
  readonly historyPhase: string | undefined;
  readonly snapshot: Snapshot | undefined;
};

/**
 * The parts of the history input that can change the baseline; the hook calls
 * `nextBaseline` only when one of them changes, so a new snapshot object for
 * the same history changes nothing.
 */
type HistoryObservation = {
  readonly bindingKey: string | undefined;
  readonly absent: boolean;
  readonly hasSnapshot: boolean;
};

const observe = <Snapshot>(
  input: HistoryInput<Snapshot>,
): HistoryObservation => ({
  bindingKey: input.bindingKey,
  absent: input.historyPhase === "absent",
  hasSnapshot: input.snapshot !== undefined,
});

const sameObservation = (left: HistoryObservation, right: HistoryObservation) =>
  left.bindingKey === right.bindingKey &&
  left.absent === right.absent &&
  left.hasSnapshot === right.hasSnapshot;

/**
 * The baseline after `input`: captured afresh for a new binding, completed
 * once when the history first reports, and otherwise unchanged.
 */
const nextBaseline = <Snapshot, Replay>(
  baseline: ReplayBaseline<Snapshot, Replay> | undefined,
  input: HistoryInput<Snapshot>,
  emptyReplay: Replay,
): ReplayBaseline<Snapshot, Replay> | undefined => {
  const { bindingKey, historyPhase, snapshot } = input;
  if (bindingKey === undefined) return undefined;
  // An absent history is ready at once, with nothing to replay.
  const readyIfAbsent: ReplayReadiness<Replay> | undefined =
    historyPhase === "absent"
      ? { status: "ready", replay: emptyReplay }
      : undefined;
  if (baseline?.key !== bindingKey) {
    return {
      key: bindingKey,
      snapshot,
      readiness: readyIfAbsent ?? { status: "pending" },
    };
  }
  if (
    baseline.readiness.status === "pending" &&
    baseline.snapshot === undefined &&
    (readyIfAbsent !== undefined || snapshot !== undefined)
  ) {
    return {
      ...baseline,
      snapshot,
      readiness: readyIfAbsent ?? baseline.readiness,
    };
  }

  return baseline;
};

/**
 * Captures the first authoritative history state for one mounted binding. An
 * absent history becomes an empty baseline during render; an existing history
 * is captured once and stays fail-closed until its asynchronous verification
 * completes. Later observation offsets cannot alter the ready baseline.
 */
export const useImmutableReplayBaseline = <Snapshot, Replay>(input: {
  readonly bindingKey: string | undefined;
  readonly emptyReplay: Replay;
  readonly historyPhase: string | undefined;
  readonly snapshot: Snapshot | undefined;
  readonly derive: (snapshot: Snapshot) => Promise<Replay>;
}): ReplayReadiness<Replay> => {
  const observation = observe(input);
  const [previousObservation, setPreviousObservation] = useState(observation);
  const [storedBaseline, setStoredBaseline] = useState(() =>
    nextBaseline<Snapshot, Replay>(undefined, input, input.emptyReplay),
  );
  let baseline = storedBaseline;
  if (!sameObservation(observation, previousObservation)) {
    setPreviousObservation(observation);
    baseline = nextBaseline(storedBaseline, input, input.emptyReplay);
    setStoredBaseline(baseline);
  }

  // The verification runs once per captured baseline, with whatever `derive`
  // the caller passes at that time; a new `derive` alone restarts nothing.
  const derive = useEffectEvent((snapshot: Snapshot) => input.derive(snapshot));
  useEffect(() => {
    const capturedSnapshot = baseline?.snapshot;
    if (
      baseline === undefined ||
      baseline.readiness.status === "ready" ||
      capturedSnapshot === undefined
    )
      return;
    let cancelled = false;
    const capturedBaseline = baseline;
    void derive(capturedSnapshot).then((replay) => {
      if (!cancelled) {
        setStoredBaseline((current) =>
          current === capturedBaseline
            ? {
                ...capturedBaseline,
                readiness: { status: "ready", replay },
              }
            : current,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [baseline]);

  return baseline?.readiness ?? { status: "pending" };
};
