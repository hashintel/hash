import type { Writable } from "node:stream";

/**
 * Minimal structured stderr logger for the CLI.
 *
 * stdout is the protocol channel, so diagnostics go to the injected error
 * stream as one JSON object per line. The stderr contract is: the first line
 * a parent reads is the human-readable ready handshake, every later line is
 * one of these JSON diagnostics. Entries never include model content,
 * request params, or error messages — those can embed user-authored code.
 */

const MAX_FIELD_CHARACTERS = 200;

export type DiagnosticsLevel = "info" | "warn" | "error";

export type DiagnosticsFields = Record<
  string,
  string | number | boolean | null
>;

export type Diagnostics = {
  /** Write one bounded JSON diagnostics line to the error stream. */
  log: (
    level: DiagnosticsLevel,
    event: string,
    fields?: DiagnosticsFields,
  ) => void;
};

/** Read the parent-supplied correlation id from an environment map. */
export function correlationIdFromEnvironment(
  environment: Record<string, string | undefined>,
): string | null {
  const value = environment.PETRINAUT_CORRELATION_ID?.trim();
  return value ? value.slice(0, MAX_FIELD_CHARACTERS) : null;
}

/** Create a stderr JSON-lines logger bound to one correlation id. */
export function createDiagnostics({
  correlationId,
  errorOutput,
}: {
  correlationId: string | null;
  errorOutput: Writable;
}): Diagnostics {
  return {
    log(level, event, fields = {}) {
      const entry: Record<string, unknown> = {
        time: new Date().toISOString(),
        level,
        event: event.slice(0, MAX_FIELD_CHARACTERS),
        correlationId,
      };
      for (const [key, value] of Object.entries(fields)) {
        entry[key] =
          typeof value === "string"
            ? value.slice(0, MAX_FIELD_CHARACTERS)
            : value;
      }
      try {
        errorOutput.write(`${JSON.stringify(entry)}\n`);
      } catch {
        // Diagnostics are best-effort and must never break the protocol.
      }
    },
  };
}
