/**
 * Helper functions injected into user-authored scenario code (parameter
 * override expressions and "Define as code" initial state).
 *
 * Safety notes for anything added here:
 * - Helpers execute while `runSandboxed` masks `.constructor` on built-in
 *   prototypes, so implementations must not rely on species-creating array
 *   methods returning subclass instances (plain loops and `push` are safe).
 * - Helper functions are handed to user code by reference. Freeze them so
 *   user code cannot attach state that leaks across evaluations. Walking
 *   `helper.constructor` inside the sandbox yields `undefined`, so passing
 *   them in does not reopen the Function-constructor escape.
 * - Declare helpers as arrow functions. `Object.freeze` is shallow, so a
 *   `function` declaration would keep a writable `helper.prototype` object —
 *   a module singleton that user code could hang state on to smuggle values
 *   from one evaluation into the next. Arrow functions have no `prototype`.
 * - Keep `SCENARIO_HELPER_TYPE_DECLARATIONS` below in sync so the code
 *   editors type-check and autocomplete every helper.
 */

/**
 * Ceiling on how many elements a single `range()` call may produce. Scenario
 * compilation runs synchronously on the UI thread, so an oversized range
 * (e.g. a mistyped parameter) must fail fast instead of freezing the tab.
 */
export const MAX_RANGE_LENGTH = 1_000_000;

/**
 * Python-style `range`.
 *
 * - `range(end)` — integers from `0` (inclusive) to `end` (exclusive).
 * - `range(start, end)` — from `start` (inclusive) to `end` (exclusive).
 * - `range(start, end, step)` — stepping by `step`; a negative step counts
 *   down. Non-integer bounds and steps are allowed.
 *
 * An empty array is returned when the direction of `step` never reaches
 * `end` (e.g. `range(5, 0)`), matching Python.
 */
export const range = (start: number, end?: number, step?: number): number[] => {
  for (const argument of [start, end, step]) {
    if (argument !== undefined && !Number.isFinite(argument)) {
      throw new Error("range() arguments must be finite numbers.");
    }
  }

  const from = end === undefined ? 0 : start;
  const to = end === undefined ? start : end;
  const by = step === undefined ? 1 : step;

  if (by === 0) {
    throw new Error("range() step must not be zero.");
  }

  // Upper bound on the element count, used to reject oversized ranges before
  // allocating anything. Floating-point division can round this *up* by one
  // (`0.28 / 0.01` is `28.000000000000004`), so it is only a ceiling — the
  // loop below decides where the range actually stops.
  const maximumLength = Math.max(0, Math.ceil((to - from) / by));
  if (maximumLength > MAX_RANGE_LENGTH) {
    throw new Error(
      `range() would produce ${maximumLength} elements, exceeding the limit of ${MAX_RANGE_LENGTH}.`,
    );
  }

  const values: number[] = [];
  for (let i = 0; i < maximumLength; i++) {
    // Compare each value against `to` rather than trusting the quotient, so a
    // fractional step can never emit the excluded endpoint.
    const value = from + i * by;
    if (by > 0 ? value >= to : value <= to) {
      break;
    }
    values.push(value);
  }
  return values;
};

/**
 * Helpers passed as extra arguments to every user-code evaluation, keyed by
 * the identifier the user code sees.
 */
export const SCENARIO_HELPERS: Readonly<Record<string, unknown>> =
  Object.freeze({
    range: Object.freeze(range),
  });

/**
 * TypeScript declarations for the helpers, prepended to the virtual files
 * that back the scenario code editors (see `generate-virtual-files.ts`), so
 * Monaco offers completions, signature help, and hover docs for them.
 */
export const SCENARIO_HELPER_TYPE_DECLARATIONS = [
  "/**",
  " * Python-style range: `range(end)` counts from 0, `range(start, end)`",
  " * from `start`, both end-exclusive. `step` may be negative to count down.",
  " */",
  "declare function range(end: number): number[];",
  "declare function range(start: number, end: number, step?: number): number[];",
].join("\n");
