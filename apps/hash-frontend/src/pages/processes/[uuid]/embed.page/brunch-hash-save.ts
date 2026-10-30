import * as z from "zod";

import { brunchTools } from "@hashintel/brunch-agent";

import type { PetrinautAiAutomaticTool } from "@hashintel/brunch-agent/ui";

/**
 * The input Brunch's HASH agent issues for its save. The agent's schema is
 * the authority and has already validated it; this only narrows it.
 */
const hashSaveInputSchema = z.object({ documentId: z.string() });

/**
 * What an agent's save settles with: the editor's `saveResult` for the save
 * it started, or, when it started none, why not.
 */
export type HashSaveOutcome =
  | {
      saved: true;
      /** The saved version's time, as the editor's `saveResult` gives it. */
      decisionTime: string | null;
      title: string;
      /** The editor still has edits the saved version doesn't include. */
      stillDirty: boolean;
    }
  | { saved: false; error: string }
  | { applied: false; reason: string };

/**
 * Runs the editor's own Save for the agent, for the net `documentId` names,
 * and settles with its result. Rejects, settling nothing, when `signal`
 * aborts first.
 */
export type SaveNetForAgent = (
  documentId: string,
  signal: AbortSignal,
) => Promise<HashSaveOutcome>;

/** Brunch's HASH save, run in the page through the editor's own Save. */
export const createHashSaveTool = (
  save: SaveNetForAgent,
): PetrinautAiAutomaticTool => ({
  toolName: brunchTools.saveHashNet,
  inputSchema: hashSaveInputSchema,
  outputSchema: { parse: (value) => value },
  execute: ({ input, signal }) =>
    save(hashSaveInputSchema.parse(input).documentId, signal),
});
