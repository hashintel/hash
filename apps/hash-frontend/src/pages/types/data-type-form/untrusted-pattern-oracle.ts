/**
 * Verdicts for inherited (possibly hostile) patterns tested against stored
 * values. A shared-type author can persist a pattern whose backtracking
 * freezes the tab — e.g. `(a|a)+$` against a near-matching value — and no
 * syntactic screen bounds regex time soundly, so nothing untrusted executes
 * on the main thread. Each (pattern, value) pair is evaluated once in a
 * terminable worker under a strict budget; until a verdict lands the pair
 * counts as matching, deferring to the server's validation on save, and a
 * timeout poisons the whole pattern so its other values defer too.
 */

type PatternTask = { key: string; pattern: string; value: string };

const verdicts = new Map<string, boolean>();
/** Patterns that blew the budget — every test of them defers to the server */
const unsafePatterns = new Set<string>();
const queuedKeys = new Set<string>();
const queue: PatternTask[] = [];
const listeners = new Set<() => void>();

let version = 0;
let worker: Worker | null = null;
let inFlight: PatternTask | null = null;
let deadline: ReturnType<typeof setTimeout> | null = null;

const budgetMs = 100;

/**
 * The regex executes only inside this source, where the host page can
 * terminate it mid-flight — a construction error counts as matching, the
 * same deferral unparsable patterns get elsewhere
 */
const workerSource = `onmessage = (event) => {
  let matched = true;
  try {
    matched = new RegExp(event.data.pattern).test(event.data.value);
  } catch {}
  postMessage(matched);
};`;

const notify = () => {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
};

const pump = (): void => {
  if (inFlight) {
    return;
  }

  let task: PatternTask | undefined = queue.shift();
  while (task && unsafePatterns.has(task.pattern)) {
    queuedKeys.delete(task.key);
    task = queue.shift();
  }
  if (!task) {
    return;
  }

  if (!worker && typeof Worker !== "undefined") {
    try {
      worker = new Worker(
        URL.createObjectURL(
          new Blob([workerSource], { type: "text/javascript" }),
        ),
      );
      worker.onmessage = (event) => {
        if (!inFlight) {
          return;
        }
        if (deadline !== null) {
          clearTimeout(deadline);
          deadline = null;
        }
        verdicts.set(inFlight.key, Boolean(event.data));
        queuedKeys.delete(inFlight.key);
        inFlight = null;
        pump();
        notify();
      };
    } catch {
      worker = null;
    }
  }
  if (!worker) {
    // No worker available (e.g. the server render) — leave the queue empty
    // and every answer deferred
    queue.length = 0;
    queuedKeys.clear();
    return;
  }

  inFlight = task;
  deadline = setTimeout(() => {
    // Over budget: the pattern is hostile or pathological — kill the worker
    // mid-execution and never run this pattern again
    worker?.terminate();
    worker = null;
    deadline = null;
    if (inFlight) {
      unsafePatterns.add(inFlight.pattern);
      queuedKeys.delete(inFlight.key);
      inFlight = null;
    }
    pump();
    notify();
  }, budgetMs);
  worker.postMessage({ pattern: task.pattern, value: task.value });
};

/**
 * Whether `value` matches the stored `pattern` — `null` while no verdict
 * exists (not yet evaluated, over budget, or no worker available), which
 * callers treat as matching, leaving the decision to the server.
 */
export const testStoredPattern = (
  pattern: string,
  value: string,
): boolean | null => {
  if (unsafePatterns.has(pattern)) {
    return null;
  }
  const key = `${pattern}\u0000${value}`;
  const verdict = verdicts.get(key);
  if (verdict !== undefined) {
    return verdict;
  }
  if (!queuedKeys.has(key)) {
    queuedKeys.add(key);
    queue.push({ key, pattern, value });
    pump();
  }
  return null;
};

/** Subscribe a React external-store hook to verdicts landing */
export const subscribeToPatternVerdicts = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const patternVerdictsVersion = () => version;
