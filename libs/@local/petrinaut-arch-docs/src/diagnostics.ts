/**
 * What every stage reports, and how.
 *
 * One shape for extraction, graph building and the checks, so the CLI formats
 * them identically and no stage has to invent its own reporting. This lived in
 * `extract.ts`, which meant the graph builder could only return bare strings and
 * the caller had to guess a file to attribute them to.
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
