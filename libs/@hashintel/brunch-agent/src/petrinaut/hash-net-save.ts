import * as z from "zod";

/**
 * The input Brunch's HASH agent issues for its save. The agent's schema is
 * the authority and has already validated it; this only narrows it.
 */
export const zHashNetSaveInput = z.object({ documentId: z.string() });

/**
 * What an agent's save settles with: the result of the editor's save it
 * started, or, when it started none, why not.
 */
export type HashNetSaveOutcome =
  | {
      saved: true;
      /** The saved version's time. */
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
export type SaveHashNetForAgent = (
  documentId: string,
  signal: AbortSignal,
) => Promise<HashNetSaveOutcome>;
