/**
 * The arrow-stepping arithmetic of the value editor, pure: what an open
 * editor's content becomes on ArrowUp/ArrowDown. Numbers step ±1 (±10 with
 * Shift) preserving the literal's decimal shape; ratios step ±0.1 (±0.01
 * with Shift) and stay between 0 and 1; empty numeric content starts from
 * 0; boolean slots set true (Up) / false (Down). Anything else returns
 * null — the arrows stay the editor's.
 */

const NUMERIC_LITERAL = /^\s*-?(\d+(\.\d*)?|\.\d+)\s*$/;
const BOOLEAN_OR_EMPTY = /^\s*(true|false)?\s*$/;

const decimalsOf = (literal: string): number =>
  /\.(\d*)\s*$/.exec(literal)?.[1]?.length ?? 0;

export function stepAdHocValue(
  current: string,
  up: boolean,
  shift: boolean,
  mode: "number" | "boolean" | "ratio",
): string | null {
  if (mode === "boolean") {
    return BOOLEAN_OR_EMPTY.test(current) ? (up ? "true" : "false") : null;
  }
  if (mode === "ratio") {
    const delta = (up ? 1 : -1) * (shift ? 0.01 : 0.1);
    const value = /^\s*$/.test(current)
      ? 0
      : NUMERIC_LITERAL.test(current)
        ? Number.parseFloat(current)
        : null;
    if (value === null) {
      return null;
    }
    const next = Math.min(1, Math.max(0, value + delta));
    return next.toFixed(Math.max(shift ? 2 : 1, decimalsOf(current)));
  }
  const delta = (up ? 1 : -1) * (shift ? 10 : 1);
  if (/^\s*$/.test(current)) {
    return String(delta);
  }
  if (!NUMERIC_LITERAL.test(current)) {
    return null;
  }
  return (Number.parseFloat(current) + delta).toFixed(decimalsOf(current));
}
