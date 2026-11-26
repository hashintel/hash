/** Single-owner preflight planning and case-provenance checks for persona launches. */
import { createHash } from "node:crypto";

import { driverFromRun, type PersonaDriver } from "./driver.ts";
import {
  personaScriptHasOpenStep,
  type LoadedPersonaScript,
} from "./script.ts";

export const personaCaseSha256 = (input: {
  readonly pack: string;
  readonly opening: string;
  readonly objective: string | undefined;
}): string => createHash("sha256").update(JSON.stringify(input)).digest("hex");

/**
 * When resuming a scripted run with an agent, the first `persona-brief.md` is
 * built from the original `caseDirectory`; refuse if its files drifted from `run.json`.
 */
export const verifyPersonaCaseResume = (
  retainedSha256: unknown,
  caseDirectory: string,
  loaded: { readonly pack: string; readonly opening: string },
): void => {
  if (typeof retainedSha256 !== "string") return;
  const current = personaCaseSha256({
    pack: loaded.pack,
    opening: loaded.opening,
    objective: undefined,
  });
  if (current !== retainedSha256)
    throw new Error(
      `Case ${caseDirectory} changed since this run; restore its files before resuming with an agent, or pass --script <continuation.json>.`,
    );
};

/** Validates script-specific CLI/launch preconditions before reading runs or starting services. */
export const assertValidScriptedLaunch = (input: {
  readonly resume: boolean;
  readonly caseDirectory?: string;
  readonly objective?: string;
  readonly script: Pick<LoadedPersonaScript, "script">;
}): void => {
  if (input.objective !== undefined)
    throw new Error("--script cannot be combined with --objective");
  if (input.resume && personaScriptHasOpenStep(input.script.script))
    throw new Error(
      "A --script passed with --resume cannot contain an `open` step",
    );
  if (
    !input.resume &&
    personaScriptHasOpenStep(input.script.script) &&
    input.caseDirectory === undefined
  )
    throw new Error(
      "Persona script contains an `open` step, which requires --case <name-or-directory>",
    );
};

export type PersonaLaunchPlan = {
  readonly effectiveDriver: PersonaDriver;
  readonly needsFreshBriefOnResume: boolean;
  /** Whether the launcher must read `caseDirectory` for metadata/hash or brief creation. */
  readonly shouldReadCase: boolean;
  /**
   * Whether `openPersonaBrowserBridge` should expect an `open` command before `say`.
   * False on resume and for scripts that omit `open`, even when `--case` is provided.
   */
  readonly expectsBridgeOpening: boolean;
};

/** Resolves effective driver, brief requirements, and bridge opening contract from one owner. */
export const planPersonaLaunch = (input: {
  readonly resume?: {
    readonly config: unknown;
    readonly hasBrief: boolean;
  };
  readonly caseDirectory?: string;
  readonly objective?: string;
  readonly driver?: PersonaDriver;
  readonly script?: Pick<LoadedPersonaScript, "script">;
}): PersonaLaunchPlan => {
  const retainedDriver = input.resume
    ? driverFromRun(input.resume.config)
    : undefined;
  if (
    input.resume &&
    input.driver === undefined &&
    retainedDriver?.kind === "scripted"
  )
    throw new Error(
      "Cannot automatically resume a scripted run without a driver option; pass --script <continuation.json>, --agent <preset>, or --agent-command '<cmd>'",
    );
  const effectiveDriver: PersonaDriver = input.driver ??
    retainedDriver ?? { kind: "external" };
  if (effectiveDriver.kind === "scripted") {
    if (input.script === undefined)
      throw new Error("Scripted driver requires a loaded persona script");
    assertValidScriptedLaunch({
      resume: input.resume !== undefined,
      caseDirectory: input.caseDirectory,
      objective: input.objective,
      script: input.script,
    });
  }
  const needsFreshBriefOnResume =
    input.resume !== undefined &&
    effectiveDriver.kind !== "scripted" &&
    !input.resume.hasBrief;
  if (needsFreshBriefOnResume && input.caseDirectory === undefined)
    throw new Error(
      "Cannot resume a case-less scripted run with a persona agent; pass --script <continuation.json>",
    );
  const shouldReadCase =
    (input.resume === undefined || needsFreshBriefOnResume) &&
    input.caseDirectory !== undefined;
  const expectsBridgeOpening =
    input.resume === undefined &&
    (effectiveDriver.kind !== "scripted" ||
      (input.script !== undefined &&
        personaScriptHasOpenStep(input.script.script)));
  return {
    effectiveDriver,
    needsFreshBriefOnResume,
    shouldReadCase,
    expectsBridgeOpening,
  };
};
