/** Append-only record of utterances Brunch admitted; resume reconciles against it. */
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";

import * as v from "valibot";

import type { PersonaAgentSettings } from "./agent.ts";

const admittedEntrySchema = v.object({
  event: v.literal("admitted"),
  source: v.picklist(["opening", "persona"]),
  message: v.pipe(v.string(), v.minLength(1)),
});

export const bridgeLogPath = (run: string) => join(run, "bridge-log.jsonl");

/** A persona utterance records the agent settings that wrote it, since a resume may start a different agent. */
export const appendAdmittedUtterance = (
  run: string,
  entry:
    | { readonly source: "opening"; readonly message: string }
    | {
        readonly source: "persona";
        readonly message: string;
        readonly submissionId: string;
        readonly personaAgent: PersonaAgentSettings;
      },
) =>
  appendFile(
    bridgeLogPath(run),
    `${JSON.stringify({
      event: "admitted",
      ...entry,
      recordedAt: new Date().toISOString(),
    })}\n`,
    { mode: 0o600 },
  );

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
