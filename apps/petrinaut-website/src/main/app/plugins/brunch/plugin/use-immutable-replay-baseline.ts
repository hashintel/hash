import { useEffect, useEffectEvent, useState } from "react";

type ReplayReadiness<Replay> =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly replay: Replay };

type ReplayBaseline<Snapshot, Replay> = {
  readonly key: string;
  readonly snapshot: Snapshot | undefined;
  readonly readiness: ReplayReadiness<Replay>;
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
  const [storedBaseline, setStoredBaseline] = useState<
    ReplayBaseline<Snapshot, Replay> | undefined
  >(undefined);
  let baseline = storedBaseline;

  if (input.bindingKey === undefined) {
    if (baseline !== undefined) setStoredBaseline(undefined);
    baseline = undefined;
  } else if (baseline === undefined || baseline.key !== input.bindingKey) {
    baseline = {
      key: input.bindingKey,
      snapshot: input.snapshot,
      readiness:
        input.historyPhase === "absent"
          ? { status: "ready", replay: input.emptyReplay }
          : { status: "pending" },
    };
    setStoredBaseline(baseline);
  } else if (
    baseline.readiness.status === "pending" &&
    baseline.snapshot === undefined &&
    (input.historyPhase === "absent" || input.snapshot !== undefined)
  ) {
    baseline = {
      ...baseline,
      snapshot: input.snapshot,
      readiness:
        input.historyPhase === "absent"
          ? { status: "ready", replay: input.emptyReplay }
          : baseline.readiness,
    };
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
