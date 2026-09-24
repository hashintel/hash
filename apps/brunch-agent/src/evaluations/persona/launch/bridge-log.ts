/** Append-only record of utterances Brunch admitted; resume reconciles against it. */
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";

import * as v from "valibot";

const admittedEntrySchema = v.object({
  event: v.literal("admitted"),
  source: v.picklist(["opening", "persona"]),
  message: v.pipe(v.string(), v.minLength(1)),
});

export const bridgeLogPath = (run: string) => join(run, "bridge-log.jsonl");

export const appendAdmittedUtterance = (
  run: string,
  source: v.InferOutput<typeof admittedEntrySchema>["source"],
  message: string,
  submissionId?: string,
) =>
  appendFile(
    bridgeLogPath(run),
    `${JSON.stringify({
      event: "admitted",
      source,
      message,
      ...(submissionId === undefined ? {} : { submissionId }),
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
  const messages = contents.split("\n").flatMap((line) => {
    if (!line.trim()) return [];
    const entry = v.safeParse(admittedEntrySchema, JSON.parse(line));
    return entry.success ? [entry.output.message] : [];
  });
  const last = messages.at(-1);
  if (last === undefined)
    throw new Error("The run has no admitted utterance to reconcile");
  return last;
};
