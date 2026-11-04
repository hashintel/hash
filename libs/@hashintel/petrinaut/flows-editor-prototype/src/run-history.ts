/**
 * Runs of the Monthly supplier review with a Quality sign-off (J6, 4 Nov design sync): Run 17 runs live, Runs 12–16
 * are past runs, one per run state. Every run is the same model (`RunFacts`): how far each stage of the For each got
 * and how the sign-off ended. A live run derives its facts from the clock; a past run states them.
 *
 * MOCK: no flow runs in the prototype.
 */
import { START_ID } from "./document";

/** One step's state in a run (local Figma glyph set 1196:88872). */
export type StepState =
  | "notReached"
  | "running"
  | "done"
  | "failed"
  | "needsReview"
  | "skipped"
  | "abandoned"
  /** A For each with some items failed; at run level, "completed with warnings" (proposed). */
  | "doneWithFailures";

/** A run mark bar segment: one per state, in proportion to its item count. */
export type BarSegment = {
  state: "done" | "failed" | "skipped" | "running" | "review" | "rest";
  count: number;
};

/** Items of a For each, for a partly done mark: done, failed, and all of them. */
export type ItemProgress = { done: number; failed: number; total: number };

export type StepRun = {
  state: StepState;
  /** For each steps and the steps inside one: their items, for the partly done mark. */
  progress?: ItemProgress;
  /** The grey count in the step list: "20", "14 of 20", "12 ✓ · 1 ×", "Waiting". */
  count?: string;
  /** For each steps: the bar along the card's bottom edge. */
  bar?: BarSegment[];
};

export const runTriggerId = "runTrigger";
export const signOffId = "qualitySignOff";
export const forEachId = "eachSupplier";

/** The loop's stages: the three reads run side by side, then Fetch, Send, Mark, one item behind each other. */
const stages = [
  ["readName", "readEmail", "readCertificateLink"],
  ["fetchCertificate"],
  ["sendReviewEmail"],
  ["markReviewed"],
] as const;

export const suppliers = [
  "Northwind Alloys",
  "Kestrel Plastics",
  "Halden Chemicals",
  "Boreal Metals",
  "Sable Ceramics",
  "Orion Packaging",
  "Coastline Salts",
  "Verity Glassworks",
  "Marlow Resins",
  "Pinecrest Minerals",
  "Ostara Fibres",
  "Quayside Oils",
  "Redwater Pigments",
  "Tamsin Solvents",
  "Union Carbon",
  "Vale Silica",
  "Westmark Paper",
  "Yarrow Textiles",
  "Zenith Coatings",
  "Brightwell Foods",
];

/** A supplier's certificate file, as J6.7 names them: "Kestrel Plastics" → "COA-KP-2611.pdf". */
export const certificateName = (supplier: string) => {
  const [first = "", second = ""] = supplier.split(" ");
  const initials =
    first === "Northwind"
      ? "NWA"
      : `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase();
  return `COA-${initials}-2611.pdf`;
};

export type RunFacts = {
  /** Items the For each goes through. */
  n: number;
  /** Items whose certificate could not be fetched, with why. The later steps skip them. */
  failures: { item: number; reason: string }[];
  /** Find active suppliers; "failed" timed out (Run 9) and nothing after it ran. */
  find: "running" | "done" | "failed";
  /** Items each loop stage has finished: reads, fetch, send, mark. */
  processed: [number, number, number, number];
  /** An item is in each unfinished stage now (a live run). */
  inFlight: boolean;
  signOff: "notReached" | "waiting" | "approved" | "timedOut";
  abandoned?: boolean;
};

export type RunOutcome =
  "running" | "needsReview" | "warnings" | "error" | "completed" | "abandoned";

export type RunRecord = {
  id: number;
  /** "Today, 10:42". */
  when: string;
  /** The clock time it started, "10:42:00", for step times in the panel. */
  startClock: string;
  trigger: { kind: "manual" | "schedule"; by: string };
  /** Shown on the banner when it ended this way. */
  ending?: string;
  /** How long it took, "1m 52s" (a past run; a live one counts its clock). */
  duration?: string;
} & (
  | {
      kind: "past";
      facts: RunFacts;
      outcome: Exclude<RunOutcome, "running" | "needsReview">;
    }
  | {
      kind: "live";
      n: number;
      failures: RunFacts["failures"];
      /** Real time (ms) at which the run's clock read 0. */
      startedAt: number;
      /** A screen frame: the clock stays at this many run seconds. */
      pinnedAt?: number;
      /** Stop pressed: the run's clock when it was stopped, and the wall time. */
      stopped?: { at: number; clock: string };
    }
);

/* ----------------------------------------------------------------------------------------------------------------
 * The live run's clock: Find active suppliers takes 6 s; then the loop finishes a stage of an item every 4 run
 * seconds, played 4× fast (one a second); then the sign-off waits, in real time.
 * ------------------------------------------------------------------------------------------------------------- */

const findSeconds = 6;
const itemSeconds = 4;
const loopSpeed = 4;

const loopSeconds = (n: number) => itemSeconds * (n + stages.length - 1);

/** Run seconds after `real` seconds of wall time. */
const runSeconds = (real: number, n: number) => {
  if (real <= findSeconds) {
    return real;
  }
  const loopReal = loopSeconds(n) / loopSpeed;
  if (real <= findSeconds + loopReal) {
    return findSeconds + (real - findSeconds) * loopSpeed;
  }
  return findSeconds + loopSeconds(n) + (real - findSeconds - loopReal);
};

/** Wall-time seconds it takes to reach `seconds` of run time. */
const realSeconds = (seconds: number, n: number) => {
  if (seconds <= findSeconds) {
    return seconds;
  }
  const loop = loopSeconds(n);
  if (seconds <= findSeconds + loop) {
    return findSeconds + (seconds - findSeconds) / loopSpeed;
  }
  return findSeconds + loop / loopSpeed + (seconds - findSeconds - loop);
};

/** A live run started so that its clock reads `seconds` at `now`. */
export const startedAtFor = (seconds: number, n: number, now: number) =>
  now - realSeconds(seconds, n) * 1000;

/** The live run's clock, in run seconds. */
export const runClock = (
  run: Extract<RunRecord, { kind: "live" }>,
  now: number,
) =>
  run.pinnedAt ??
  run.stopped?.at ??
  runSeconds(Math.max(0, (now - run.startedAt) / 1000), run.n);

export const signOffAt = (n: number) => findSeconds + loopSeconds(n);

const liveFacts = (
  run: Extract<RunRecord, { kind: "live" }>,
  now: number,
): RunFacts => {
  const seconds = runClock(run, now);
  const base = {
    n: run.n,
    failures: run.failures,
    abandoned: Boolean(run.stopped),
  };
  if (seconds < findSeconds) {
    return {
      ...base,
      find: "running",
      processed: [0, 0, 0, 0],
      inFlight: false,
      signOff: "notReached",
    };
  }
  const ticks = Math.floor((seconds - findSeconds) / itemSeconds);
  const processed = stages.map((_, stage) =>
    Math.min(run.n, Math.max(0, ticks - stage)),
  ) as RunFacts["processed"];
  const loopDone = processed[3] >= run.n;
  return {
    ...base,
    find: "done",
    processed,
    inFlight: !loopDone,
    signOff: loopDone ? "waiting" : "notReached",
  };
};

export const factsOf = (run: RunRecord, now: number): RunFacts =>
  run.kind === "past" ? run.facts : liveFacts(run, now);

/* ----------------------------------------------------------------------------------------------------------------
 * Step states
 * ------------------------------------------------------------------------------------------------------------- */

const failedBefore = (facts: RunFacts, count: number) =>
  facts.failures.filter((failure) => failure.item < count).length;

const loopStepRun = (facts: RunFacts, stage: number): StepRun => {
  const { n } = facts;
  const processed = facts.processed[stage]!;
  if (facts.find !== "done") {
    // Inside the loop: no glyph, and an empty bar until an item gets here.
    return { state: "notReached", bar: [] };
  }
  const misses = failedBefore(facts, processed);
  const done = stage === 0 ? processed : processed - misses;
  const failed = stage === 1 ? misses : 0;
  const skipped = stage >= 2 ? misses : 0;
  const running = facts.inFlight && !facts.abandoned && processed < n ? 1 : 0;
  const bar: BarSegment[] = [
    { state: "done" as const, count: done },
    { state: "failed" as const, count: failed },
    { state: "skipped" as const, count: skipped },
    { state: "running" as const, count: running },
    { state: "rest" as const, count: n - processed - running },
  ].filter((segment) => segment.count > 0);
  const count =
    failed > 0
      ? `${done} ✓ · ${failed} ×`
      : skipped > 0 && processed === n
        ? `${done} of ${n}`
        : processed === 0 && running === 0
          ? undefined
          : String(done);
  const state: StepState = facts.abandoned
    ? processed > 0
      ? "abandoned"
      : "notReached"
    : processed < n
      ? processed === 0 && running === 0
        ? "notReached"
        : "running"
      : failed > 0
        ? "doneWithFailures"
        : "done";
  return { state, count, bar, progress: { done, failed, total: n } };
};

export const stepRuns = (facts: RunFacts): Record<string, StepRun> => {
  const { n } = facts;
  const runs: Record<string, StepRun> = {
    [runTriggerId]: { state: "done" },
    [START_ID]: { state: "done" },
    findSuppliers:
      facts.find === "running"
        ? { state: facts.abandoned ? "abandoned" : "running" }
        : facts.find === "failed"
          ? { state: "failed", count: "Timed out" }
          : { state: "done", count: String(n) },
  };
  stages.forEach((ids, stage) => {
    for (const id of ids) {
      runs[id] = loopStepRun(facts, stage);
    }
  });
  const finished = facts.processed[3];
  const failed = facts.failures.length;
  const throughFailed = failedBefore(facts, finished);
  const failedItems = failedBefore(facts, facts.processed[1]!);
  const doneItems = finished - throughFailed;
  const runningItems = facts.abandoned
    ? 0
    : Math.max(
        0,
        facts.processed[0]! - finished - (failedItems - throughFailed),
      );
  const forEachBar: BarSegment[] = [
    { state: "done" as const, count: doneItems },
    { state: "failed" as const, count: failedItems },
    { state: "running" as const, count: runningItems },
    {
      state: "rest" as const,
      count: Math.max(0, n - doneItems - failedItems - runningItems),
    },
  ].filter((segment) => segment.count > 0);
  const forEachProgress = { done: doneItems, failed: failedItems, total: n };
  runs[forEachId] =
    facts.find !== "done"
      ? { state: "notReached" }
      : facts.abandoned
        ? {
            state: "abandoned",
            count: `${finished} of ${n}`,
            bar: forEachBar,
          }
        : finished < n
          ? {
              state: "running",
              count: `${facts.processed[0]} of ${n}`,
              bar: forEachBar,
            }
          : failed > 0
            ? {
                state: "doneWithFailures",
                count: `${n - failed} ✓ · ${failed} ×`,
                bar: forEachBar,
                progress: forEachProgress,
              }
            : { state: "done", count: `${n} of ${n}`, bar: forEachBar };
  runs[signOffId] =
    facts.signOff === "waiting"
      ? facts.abandoned
        ? { state: "abandoned", count: "Stopped" }
        : { state: "needsReview", count: "Waiting" }
      : facts.signOff === "approved"
        ? { state: "done", count: "Approved" }
        : facts.signOff === "timedOut"
          ? { state: "failed", count: "Timed out" }
          : { state: "notReached" };
  return runs;
};

/* ----------------------------------------------------------------------------------------------------------------
 * Run level
 * ------------------------------------------------------------------------------------------------------------- */

export const outcomeOf = (run: RunRecord, now: number): RunOutcome => {
  if (run.kind === "past") {
    return run.outcome;
  }
  if (run.stopped) {
    return "abandoned";
  }
  return liveFacts(run, now).signOff === "waiting" ? "needsReview" : "running";
};

/** A run's items, for its partly done mark: how far its For each got. */
export const runProgress = (run: RunRecord, now: number) =>
  stepRuns(factsOf(run, now))[forEachId]?.progress;

/** The glyph a run shows: the same set as steps. */
export const outcomeState: Record<RunOutcome, StepState> = {
  running: "running",
  needsReview: "needsReview",
  warnings: "doneWithFailures",
  error: "failed",
  completed: "done",
  abandoned: "abandoned",
};

export const outcomeLabel: Record<RunOutcome, string> = {
  running: "Running",
  needsReview: "Needs review",
  warnings: "Completed with warnings",
  error: "Error",
  completed: "Completed",
  abandoned: "Abandoned",
};

export const minutes = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** "10:42:00" plus `seconds`, as "10:42:06". */
export const clockPlus = (start: string, seconds: number) => {
  const [h = 0, m = 0, s = 0] = start.split(":").map(Number);
  const total = h * 3600 + m * 60 + s + Math.round(seconds);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${part(Math.floor(total / 3600) % 24)}:${part(Math.floor(total / 60) % 60)}:${part(total % 60)}`;
};

/** When a loop stage started and ended, in run seconds, by the same clock the live run uses. */
export const stageSpan = (stepId: string, n: number) => {
  const stage = stages.findIndex((ids) =>
    (ids as readonly string[]).includes(stepId),
  );
  if (stage < 0) {
    return null;
  }
  return {
    from: findSeconds + itemSeconds * stage,
    to: findSeconds + itemSeconds * (n + stage),
  };
};

export const findSpan = { from: 0, to: findSeconds };

/** The banner's detail after the state, e.g. "1:02 · 14 of 20 suppliers · 1 failed so far". */
export const bannerDetail = (
  run: RunRecord,
  now: number,
  narrow: boolean,
): string => {
  const facts = factsOf(run, now);
  const outcome = outcomeOf(run, now);
  const failed = facts.failures.length;
  if (run.kind === "live" && outcome === "running") {
    const seconds = runClock(run, now);
    if (facts.find === "running") {
      return `${minutes(seconds)} · at Find active suppliers`;
    }
    const failedSoFar = failedBefore(facts, facts.processed[1]);
    return [
      minutes(seconds),
      `${facts.processed[0]} of ${facts.n} suppliers`,
      ...(failedSoFar > 0 ? [`${failedSoFar} failed so far`] : []),
    ].join(" · ");
  }
  if (run.kind === "live" && outcome === "needsReview") {
    return `Head of quality signs off · waiting ${minutes(runClock(run, now) - signOffAt(run.n))}`;
  }
  if (run.kind === "live" && run.stopped) {
    return `stopped by you at ${run.stopped.clock} · ${facts.processed[3]} of ${facts.n} suppliers done`;
  }
  if (outcome === "warnings") {
    return narrow
      ? `${failed} not fetched`
      : `${failed} of ${facts.n} certificates not fetched`;
  }
  return run.ending ?? `${facts.n} of ${facts.n} suppliers reviewed`;
};

/** The banner's one button. */
export const bannerAction = (run: RunRecord, now: number) => {
  const outcome = outcomeOf(run, now);
  if (outcome === "running" || outcome === "needsReview") {
    return "Stop";
  }
  if (outcome === "warnings") {
    return `Re-run ${factsOf(run, now).failures.length} failed`;
  }
  return "Re-run";
};

/* ----------------------------------------------------------------------------------------------------------------
 * The runs
 * ------------------------------------------------------------------------------------------------------------- */

const finished = (
  n: number,
  failures: RunFacts["failures"],
  signOff: RunFacts["signOff"],
): RunFacts => ({
  n,
  failures,
  find: "done",
  processed: [n, n, n, n],
  inFlight: false,
  signOff,
});

/** Run 17's failure: the ninth supplier's certificate link is dead. */
const liveFailures = [{ item: 8, reason: "404" }];

export const liveRun17 = (
  now: number,
  at: { seconds: number; pinned: boolean },
): RunRecord => ({
  id: 17,
  kind: "live",
  when: "Today, 10:42",
  startClock: "10:42:00",
  trigger: { kind: "manual", by: "Dora" },
  n: suppliers.length,
  failures: liveFailures,
  startedAt: startedAtFor(at.seconds, suppliers.length, now),
  ...(at.pinned ? { pinnedAt: at.seconds } : {}),
});

const scheduled = (
  id: number,
  when: string,
  n: number,
  duration: string,
): RunRecord => ({
  id,
  kind: "past",
  when,
  startClock: "09:00:00",
  trigger: { kind: "schedule", by: "monthly" },
  outcome: "completed",
  ending: `${n} of ${n} suppliers reviewed · signed off`,
  duration,
  facts: finished(n, [], "approved"),
});

/** Runs 1–16, newest first (J6.0 lists 17 to 8; the tabs count all 17). */
export const pastRuns = (): RunRecord[] => [
  {
    id: 16,
    kind: "past",
    when: "Today, 08:15",
    startClock: "08:15:00",
    trigger: { kind: "manual", by: "Dora" },
    outcome: "warnings",
    duration: "1m 52s",
    facts: finished(
      suppliers.length,
      [
        { item: 3, reason: "404" },
        { item: 4, reason: "timed out" },
      ],
      "approved",
    ),
  },
  {
    id: 15,
    kind: "past",
    when: "2 Nov, 16:20",
    startClock: "16:20:00",
    trigger: { kind: "manual", by: "Dora" },
    outcome: "error",
    ending: "Head of quality signs off timed out after 48 h",
    duration: "48h 02m",
    facts: finished(suppliers.length, [], "timedOut"),
  },
  scheduled(14, "1 Nov, 09:00", 20, "2m 04s"),
  {
    id: 13,
    kind: "past",
    when: "31 Oct, 11:05",
    startClock: "11:05:00",
    trigger: { kind: "manual", by: "Dora" },
    outcome: "abandoned",
    ending: "cancelled by Dora at 11:07 · 6 of 20 suppliers done",
    duration: "2m 10s",
    facts: {
      n: suppliers.length,
      failures: [],
      find: "done",
      processed: [7, 6, 6, 6],
      inFlight: false,
      signOff: "notReached",
      abandoned: true,
    },
  },
  scheduled(12, "1 Oct, 09:00", 19, "1m 58s"),
  scheduled(11, "1 Sep, 09:00", 19, "2m 01s"),
  scheduled(10, "1 Aug, 09:00", 18, "1m 47s"),
  {
    id: 9,
    kind: "past",
    when: "1 Jul, 09:00",
    startClock: "09:00:00",
    trigger: { kind: "schedule", by: "monthly" },
    outcome: "error",
    ending: "Find active suppliers timed out after 5 min",
    duration: "5m 00s",
    facts: {
      n: 0,
      failures: [],
      find: "failed",
      processed: [0, 0, 0, 0],
      inFlight: false,
      signOff: "notReached",
    },
  },
  scheduled(8, "1 Jun, 09:00", 18, "1m 44s"),
  scheduled(7, "1 May, 09:00", 18, "1m 50s"),
  scheduled(6, "1 Apr, 09:00", 17, "1m 41s"),
  scheduled(5, "1 Mar, 09:00", 17, "1m 39s"),
  scheduled(4, "1 Feb, 09:00", 17, "1m 44s"),
  scheduled(3, "1 Jan, 09:00", 16, "1m 36s"),
  scheduled(2, "1 Dec 2025, 09:00", 16, "1m 33s"),
  {
    ...scheduled(1, "18 Nov 2025, 14:30", 15, "1m 30s"),
    startClock: "14:30:00",
    trigger: { kind: "manual", by: "Dora" },
  },
];

/** A run started now from the editor's Run, or a banner's Re-run (`items` items, none failing). */
export const newLiveRun = (
  id: number,
  now: number,
  items = suppliers.length,
): RunRecord => {
  const date = new Date(now);
  const part = (value: number) => String(value).padStart(2, "0");
  const hm = `${part(date.getHours())}:${part(date.getMinutes())}`;
  return {
    id,
    kind: "live",
    when: `Today, ${hm}`,
    startClock: `${hm}:${part(date.getSeconds())}`,
    trigger: { kind: "manual", by: "Dora" },
    n: items,
    failures: [],
    startedAt: now,
  };
};

export const triggerLabel = (run: RunRecord) =>
  run.trigger.kind === "manual"
    ? {
        title: "Manual run",
        row: `Manual run · ${run.trigger.by}`,
        line: `${run.trigger.by} · ${run.when}`,
      }
    : {
        title: "Schedule",
        row: "Schedule · monthly",
        line: `Monthly · ${run.when}`,
      };

/** Is any run still moving (so the clock needs to tick)? */
export const anyTicking = (runs: RunRecord[]) =>
  runs.some(
    (run) => run.kind === "live" && run.pinnedAt === undefined && !run.stopped,
  );

/**
 * The bar along a card's bottom edge (Aakarsh, 4 Nov: "the bottom bar on everything", no tick glyphs on cards). A
 * step inside a For each, and the For each itself, split it by item; a step that runs once fills it with its state.
 * A step not reached shows the empty track.
 */
export const barOf = (mark: StepRun | undefined): BarSegment[] | null => {
  if (!mark) {
    return null;
  }
  // Not reached: the bar's empty track, so every card in a run carries one.
  if (mark.state === "notReached") {
    return mark.bar && mark.bar.length > 0
      ? mark.bar
      : [{ state: "rest", count: 1 }];
  }
  if (mark.bar && mark.bar.length > 0) {
    return mark.bar;
  }
  const single: Record<
    Exclude<StepState, "notReached">,
    BarSegment["state"]
  > = {
    done: "done",
    doneWithFailures: "done",
    failed: "failed",
    running: "running",
    needsReview: "review",
    skipped: "skipped",
    abandoned: "rest",
  };
  return [{ state: single[mark.state], count: 1 }];
};
