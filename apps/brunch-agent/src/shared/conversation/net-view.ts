/**
 * The one rule for which net results show the model the net: a read of it, or
 * a settled change that carries the net read back. The context projection
 * applies it to the model's context; net freshness and `query_basis` apply it
 * to canonical history.
 */

import {
  browserExecutedToolNames,
  browserToolMutatesDocument,
  isNetObservationTool,
  parseClientToolResultMetadata,
} from "@hashintel/brunch-agent";

import type { NetStructure } from "@hashintel/brunch-agent";

/** Whether a settled result of this tool can show the model the net. */
export const mayShowNet = (toolName: string): boolean =>
  browserExecutedToolNames.has(toolName) &&
  (isNetObservationTool(toolName) || browserToolMutatesDocument(toolName));

export type NetResultView =
  | {
      readonly kind: "read";
      /** The revision the read observed, when the browser reported one. */
      readonly revision: string | undefined;
    }
  | {
      readonly kind: "change";
      /** The revision the change produced. */
      readonly revision: string;
      /** The net's structure after the change. */
      readonly readBack: NetStructure;
    };

/**
 * What a successful browser result shows of the net: a read shows it at the
 * revision it observed; a change shows it only when it changed the document
 * and carries the read-back. Anything else shows nothing.
 */
export const netResultView = (
  toolName: string,
  metadata: unknown,
): NetResultView | undefined => {
  if (!mayShowNet(toolName)) return undefined;
  const parsed = parseClientToolResultMetadata(metadata);
  if (isNetObservationTool(toolName))
    return { kind: "read", revision: parsed?.documentRevision.before };
  const revision = parsed?.documentRevision.after;
  const readBack = parsed?.readBack;
  return revision === undefined || readBack === undefined
    ? undefined
    : { kind: "change", revision, readBack };
};
