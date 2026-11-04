/**
 * What every stage reports, and how: one shape for the scan, the facts, the
 * model and the checks, so the CLI formats them identically and no stage has
 * to invent its own reporting.
 */

export interface Diagnostic {
  /** Repo-relative path the reader should open. */
  file: string;
  line: number | null;
  message: string;
  severity: "error" | "warning";
}

/** Fails the build. */
export const error = (
  file: string,
  message: string,
  line: number | null = null,
): Diagnostic => ({ file, line, message, severity: "error" });

/** Reported, but does not fail the build. */
export const warning = (
  file: string,
  message: string,
  line: number | null = null,
): Diagnostic => ({ file, line, message, severity: "warning" });

export const countErrors = (diagnostics: Diagnostic[]): number =>
  diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;

/** The message of whatever was thrown. */
export const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
