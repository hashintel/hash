/**
 * `?runtime=t1..t4` (10 Nov, run-bar-time): where the run's time goes in the r2-2 run bar. URL only; without it the bar
 * has no time, as picked.
 * - t1: faint, inside the switcher after the ID, as the editor's "v6 · Draft": ‹ Run 2C07 · 08:15 ▾ ›.
 * - t2: the time is the switcher's label, ‹ Today 08:15 ▾ ›; the ID is in the menu rows and the run panel.
 * - t3: faint text on the right, before the actions: "Started 08:15 · 1m 52s".
 * - t4: not in the bar. The run panel's second line leads with it; the menu rows keep theirs.
 */
import { outcomeLabel, outcomeOf, runClock, type RunRecord } from "./run-history";

export type RunTimeTake = "t1" | "t2" | "t3" | "t4";

export const runTimeTake = (): RunTimeTake | null => {
  // t3 is the default (inbox run-bar-time, decided); `?runtime=today` keeps the bar from before.
  const value = new URLSearchParams(globalThis.location.search).get("runtime");
  return value === "t1" || value === "t2" || value === "t3" || value === "t4"
    ? value
    : value === "today"
      ? null
      : "t3";
};

/** Whole seconds, as past runs write their length: "14 s", "2m 14s", "1h 02m". */
const clockText = (seconds: number) => {
  const whole = Math.floor(seconds);
  const pad = (value: number) => String(value).padStart(2, "0");
  return whole >= 3600
    ? `${Math.floor(whole / 3600)}h ${pad(Math.floor((whole % 3600) / 60))}m`
    : whole >= 60
      ? `${Math.floor(whole / 60)}m ${pad(whole % 60)}s`
      : `${whole} s`;
};

const parts = (run: Pick<RunRecord, "when">) => {
  const comma = run.when.lastIndexOf(", ");
  return comma < 0
    ? { day: run.when, time: "" }
    : { day: run.when.slice(0, comma), time: run.when.slice(comma + 2) };
};

/** A live run that has not ended: "Running", "Needs review". */
const liveWord = (run: RunRecord, now: number) => {
  const outcome = outcomeOf(run, now);
  return outcome === "running" || outcome === "needsReview"
    ? outcomeLabel[outcome]
    : null;
};

/** How long it ran, or has been running: "1m 52s", "2m 14s". */
export const runLength = (run: RunRecord, now: number) =>
  run.kind === "live"
    ? clockText(runClock(run, now))
    : (run.duration ?? "");

/** t1: "08:15", "Yesterday 09:10", "2 Nov"; a live run "Running · 2m 14s". */
export const shortTime = (run: RunRecord, now: number) => {
  const word = liveWord(run, now);
  if (word) {
    return `${word} · ${runLength(run, now)}`;
  }
  const { day, time } = parts(run);
  return day === "Today" ? time : day === "Yesterday" ? `${day} ${time}` : day;
};

/** t2: the start, whole: "Today 08:15", "2 Nov 16:20". */
export const startTime = (run: RunRecord) => {
  const { day, time } = parts(run);
  return time ? `${day} ${time}` : day;
};

/** t2's faint tail on a live run: "Running · 2m 14s". */
export const liveTail = (run: RunRecord, now: number) => {
  const word = liveWord(run, now);
  return word ? `${word} · ${runLength(run, now)}` : null;
};

/** t3: duration first, then when it started (5 Nov, L424): "1m 52s · Today, 08:15", "12 s · 5 Nov, 14:02". */
export const startedLine = (run: RunRecord, now: number) => {
  const length = runLength(run, now);
  return length ? `${length} · ${run.when}` : run.when;
};
