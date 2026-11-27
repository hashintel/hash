/** Append-only record of utterances Brunch admitted; resume reconciles against it. */
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";

import * as v from "valibot";

import type { PersonaAllowedEdit } from "../browser-turn.ts";
import type { PersonaDriver } from "./driver.ts";
import type { PersonaScriptStep } from "./script.ts";

const admittedEntrySchema = v.object({
  event: v.literal("admitted"),
  source: v.picklist(["opening", "persona"]),
  message: v.pipe(v.string(), v.minLength(1)),
});

export const bridgeLogPath = (run: string) => join(run, "bridge-log.jsonl");

const appendBridgeRecord = (run: string, record: Record<string, unknown>) =>
  appendFile(
    bridgeLogPath(run),
    `${JSON.stringify({ ...record, recordedAt: new Date().toISOString() })}\n`,
    { mode: 0o600 },
  );

/** Every admitted utterance records the driver that sent it, since a resume may switch drivers. */
export const appendAdmittedUtterance = (
  run: string,
  entry: {
    readonly source: "opening" | "persona";
    readonly message: string;
    readonly submissionId: string;
    readonly personaDriver: PersonaDriver;
  },
) => appendBridgeRecord(run, { event: "admitted", ...entry });

/** Records the failing step when a scripted driver halts on an error. */
export const appendScriptStepFailed = (
  run: string,
  entry: {
    readonly stepIndex: number;
    readonly step: PersonaScriptStep;
    readonly error: string;
    readonly personaDriver: PersonaDriver;
  },
) => appendBridgeRecord(run, { event: "script-step-failed", ...entry });

/** The persona cannot see approval panels, so the launcher allows each destructive edit or save and records what the panel showed. */
export const appendAllowedDestructiveEdit = (
  run: string,
  edit: PersonaAllowedEdit,
) =>
  appendBridgeRecord(run, {
    event: edit.kind === "save" ? "save-allowed" : "destructive-edit-allowed",
    items: edit.items,
  });

export const lastAdmittedUtterance = async (run: string) => {
  const contents = await readFile(bridgeLogPath(run), "utf8").catch(
    (cause: unknown) => {
      throw new Error(
        `Resume requires ${bridgeLogPath(run)}; runs from the Pi extension launcher cannot be resumed`,
        { cause },
      );
    },
  );
  const messages = contents.split("\n").flatMap((line, index) => {
    if (!line.trim()) return [];
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch (cause) {
      // An interrupted append can leave a torn final line; resume cannot guess what it held.
      throw new Error(
        `${bridgeLogPath(run)} line ${index + 1} is not valid JSON; refusing automatic resume`,
        { cause },
      );
    }
    const entry = v.safeParse(admittedEntrySchema, record);
    return entry.success ? [entry.output.message] : [];
  });
  const last = messages.at(-1);
  if (last === undefined)
    throw new Error("The run has no admitted utterance to reconcile");
  return last;
};
