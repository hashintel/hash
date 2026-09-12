/**
 * The Elapsed column's readout: wall-clock time since stepping began, ticking
 * on its own while the experiment is active so the rest of the drawer is
 * rebuilt only when the record changes.
 */
import { useEffect, useState } from "react";

import { getExperimentElapsedMs } from "../../../../../../../react/experiments/context";
import { formatDurationMs } from "../format-duration";

/** How often the readout advances while the experiment runs. */
const TICK_MS = 250;

export const ElapsedStat = ({
  startedAt,
  finishedAt,
  active,
}: {
  startedAt: number | null;
  finishedAt: number | null;
  /** Whether the clock advances: a stalled run keeps counting until it finishes. */
  active: boolean;
}) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    const intervalId = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [active]);

  const elapsedMs = getExperimentElapsedMs({ startedAt, finishedAt }, now);
  return elapsedMs === null ? "—" : formatDurationMs(elapsedMs);
};
