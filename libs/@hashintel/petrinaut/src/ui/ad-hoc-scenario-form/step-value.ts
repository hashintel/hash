/**
 * The arrow-stepping arithmetic of the value editor, pure: what an open
 * editor's content becomes on ArrowUp/ArrowDown. Numbers step ±1 (±10 with
 * Shift) preserving the literal's decimal shape; ratios step ±0.1 (±0.01
 * with Shift) and stay between 0 and 1; empty numeric content starts from
 * 0; boolean slots set true (Up) / false (Down). Anything else returns
 * null — the arrows stay the editor's.
 *
 * Content is trimmed once and every test runs on the trimmed text. A
 * whitespace-tolerant pattern such as `^\s*(true|false)?\s*$` backtracks
 * quadratically on a long run of spaces, and an editor can hold one.
 */

/** A plain numeric literal, already trimmed. */
const NUMERIC_LITERAL = /^-?(\d+(\.\d*)?|\.\d+)$/;

const decimalsOf = (literal: string): number =>
  /\.(\d*)$/.exec(literal)?.[1]?.length ?? 0;

export function stepAdHocValue(
  current: string,
  up: boolean,
  shift: boolean,
  mode: "number" | "boolean" | "ratio",
): string | null {
  const text = current.trim();
  if (mode === "boolean") {
    return text === "" || text === "true" || text === "false"
      ? up
        ? "true"
        : "false"
      : null;
  }
  if (mode === "ratio") {
    const delta = (up ? 1 : -1) * (shift ? 0.01 : 0.1);
    const value =
      text === "" ? 0 : NUMERIC_LITERAL.test(text) ? Number(text) : null;
    if (value === null) {
      return null;
    }
    const next = Math.min(1, Math.max(0, value + delta));
    return next.toFixed(Math.max(shift ? 2 : 1, decimalsOf(text)));
  }
  const delta = (up ? 1 : -1) * (shift ? 10 : 1);
  if (text === "") {
    return String(delta);
  }
  if (!NUMERIC_LITERAL.test(text)) {
    return null;
  }
  return (Number(text) + delta).toFixed(decimalsOf(text));
}
