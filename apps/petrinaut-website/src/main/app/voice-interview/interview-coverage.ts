import { SWEEP_TOOL_NAME } from "@hashintel/brunch-agent-transport-aisdk/client-tools";

import { sweepOutputSchema } from "../local-storage-demo/brunch-panel-transport";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

export interface InterviewCoverage {
  readonly complete: boolean;
  readonly covered: readonly string[];
  readonly stillExploring: readonly string[];
}

const unique = (items: string[]): string[] => [...new Set(items)];

const nodeLabel = (nodeId: string): string => {
  const separator = nodeId.indexOf(":");
  return separator === -1 ? nodeId : nodeId.slice(separator + 1);
};

export const selectInterviewCoverage = (
  messages: PetrinautAiMessage[],
): InterviewCoverage | null => {
  for (const message of messages.toReversed()) {
    for (const part of message.parts.toReversed()) {
      if (
        part.type !== "dynamic-tool" ||
        part.toolName !== SWEEP_TOOL_NAME ||
        part.state !== "output-available"
      ) {
        continue;
      }
      const parsed = sweepOutputSchema.safeParse(part.output);
      if (
        !parsed.success ||
        parsed.data.status !== "applied" ||
        parsed.data.completion === undefined
      ) {
        continue;
      }

      const { completion } = parsed.data;
      const nodesWithFailures = new Set(
        completion.failures.flatMap((failure) =>
          failure.nodeId === undefined ? [] : [failure.nodeId],
        ),
      );
      const covered = unique(
        completion.sliceNodeIds
          .filter((nodeId) => !nodesWithFailures.has(nodeId))
          .map(nodeLabel),
      );
      const stillExploring = unique(
        completion.failures.map((failure) =>
          failure.nodeId === undefined
            ? failure.message
            : `${nodeLabel(failure.nodeId)} — ${failure.slot ?? failure.message}`,
        ),
      );

      return {
        complete: completion.complete,
        covered,
        stillExploring,
      };
    }
  }
  return null;
};
