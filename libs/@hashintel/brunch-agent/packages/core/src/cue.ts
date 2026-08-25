/**
 * The cue — what the harness tells the interviewer after it has read the model.
 *
 * A sweep list is the completion report's failures plus the patterns whose
 * kind-index matches a node that still has one. It is a harness fact, so it
 * reaches the model as a tool result or a signal entry, never interpolated
 * into instructions (Flue routing: "you need the model to see a harness fact").
 * Patterns are surfaced, never mandated; the interviewer decides.
 */

import { type CompletionFailure, type CompletionReport } from "./completion";
import { type ElicitedModel } from "./elicited-model";
import { type PatternRow } from "./plugin-file";

export interface PatternCue {
  readonly id: string;
  readonly nodeId: string;
  readonly ask: string;
}

export interface SweepList {
  readonly unsatisfied: readonly CompletionFailure[];
  readonly patterns: readonly PatternCue[];
}

export const buildSweepList = (
  model: ElicitedModel,
  report: CompletionReport,
  patterns: readonly PatternRow[],
): SweepList => {
  const failingNodeIds = new Set(
    report.failures.flatMap((failure) =>
      failure.nodeId === undefined ? [] : [failure.nodeId],
    ),
  );
  const cues: PatternCue[] = [];
  for (const node of model.nodes) {
    if (!failingNodeIds.has(node.id)) continue;
    for (const pattern of patterns) {
      if (pattern.kinds.includes(node.kind)) {
        cues.push({ id: pattern.id, nodeId: node.id, ask: pattern.ask });
      }
    }
  }
  return { unsatisfied: report.failures, patterns: cues };
};

export interface CompletionCueSignal {
  readonly type: "completion-cue";
  readonly tagName: "completion-cue";
  readonly body: string;
}

const renderFailure = (failure: CompletionFailure): string =>
  `- [${failure.diagnostic}] ${failure.message}`;

export const buildCompletionCueSignal = (
  model: ElicitedModel,
  report: CompletionReport,
  sweepList: SweepList,
  options: { readonly maxItems?: number } = {},
): CompletionCueSignal => {
  const maxItems = options.maxItems ?? 12;
  const shown = sweepList.unsatisfied.slice(0, maxItems);
  const hidden = sweepList.unsatisfied.length - shown.length;
  const nodeSummary = `${model.nodes.length} node(s) from ${model.activeCaptureIds.size} active capture(s)${model.unmapped.length > 0 ? `; ${model.unmapped.length} capture(s) could not be mapped to a kind and slot` : ""}`;
  const parts = [
    `The harness folded the model at revision ${report.revision} (plugin ${report.pluginVersion}): ${nodeSummary}. Complete: ${report.complete ? "yes" : "no"}.`,
  ];
  if (shown.length > 0) {
    parts.push(
      [
        "Unsatisfied, in file order:",
        ...shown.map(renderFailure),
        ...(hidden > 0 ? [`- … and ${hidden} more.`] : []),
      ].join("\n"),
    );
  }
  if (sweepList.patterns.length > 0) {
    const byPattern = new Map<string, PatternCue>();
    for (const cue of sweepList.patterns) {
      if (!byPattern.has(cue.id)) byPattern.set(cue.id, cue);
    }
    parts.push(
      [
        "Patterns whose trigger may apply (discretionary):",
        ...[...byPattern.values()]
          .slice(0, maxItems)
          .map((cue) => `- ${cue.id} on ${cue.nodeId}: ${cue.ask}`),
      ].join("\n"),
    );
  }
  if (report.outsideSlice.length > 0) {
    parts.push(
      `${report.outsideSlice.length} node(s) lie outside every objective's dependency slice and are recorded but not demanded.`,
    );
  }
  parts.push(
    "Completion is computed from the model, never from the conversation; it does not decide whether to continue. Choose the next question, or none.",
  );
  return {
    type: "completion-cue",
    tagName: "completion-cue",
    body: parts.join("\n\n"),
  };
};

export const completionProtocolInstructionFragments = (): readonly string[] => [
  "After each applied sweep the harness folds the active captures into the model and reports which demanded slots are unsatisfied and why, with the patterns whose trigger may apply. Read it as a map of what is still unknown, not as an instruction to ask.",
  "A slot is satisfied only by what the expert said or confirmed, at the precision the row demands. Never state a value the expert did not give; record what you would assume in the assumption ledger and ask.",
];
