/**
 * The arrow-stepping arithmetic of the value editor, pure: what an open
 * editor's content becomes on ArrowUp/ArrowDown. Numbers step ±1 (±10 with
 * Shift) preserving the literal's decimal shape; empty numeric content
 * starts from 0; boolean slots set true (Up) / false (Down). Anything else
 * returns null — the arrows stay the editor's.
 */

const NUMERIC_LITERAL = /^\s*-?(\d+(\.\d*)?|\.\d+)\s*$/;
const BOOLEAN_OR_EMPTY = /^\s*(true|false)?\s*$/;

export function stepAdHocValue(
  current: string,
  up: boolean,
  shift: boolean,
  mode: "number" | "boolean",
): string | null {
  if (mode === "boolean") {
    return BOOLEAN_OR_EMPTY.test(current) ? (up ? "true" : "false") : null;
  }
  const delta = (up ? 1 : -1) * (shift ? 10 : 1);
  if (/^\s*$/.test(current)) {
    return String(delta);
  }
  if (!NUMERIC_LITERAL.test(current)) {
    return null;
  }
  const decimals = /\.(\d*)\s*$/.exec(current)?.[1]?.length ?? 0;
  return (Number.parseFloat(current) + delta).toFixed(decimals);
}
