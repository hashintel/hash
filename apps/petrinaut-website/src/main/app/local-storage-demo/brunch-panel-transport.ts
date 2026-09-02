import { SWEEP_TOOL_NAME } from "@hashintel/brunch-agent/client-tools";

import { sweepOutputSchema } from "../brunch-sweep-output";

import type {
  SweepCapture,
  SweepCompletionFailure,
  SweepCompletionReport,
} from "../brunch-sweep-output";
import type { PetrinautAiChatTransport } from "@hashintel/petrinaut/ui";
import type { UIMessageChunk } from "ai";

const formatFailure = (failure: SweepCompletionFailure): string => {
  const location =
    failure.nodeId === undefined
      ? ""
      : ` at ${failure.nodeId}${failure.slot === undefined ? "" : `.${failure.slot}`}`;
  const captures =
    failure.captureIds.length === 0
      ? ""
      : ` Captures: ${failure.captureIds.join(", ")}`;
  return `Completion gap [${failure.diagnostic}]${location}: needs ${failure.requirement}; actual ${failure.actual}. ${failure.message}${captures}`;
};

const formatCapture = (capture: SweepCapture): string => {
  const content =
    "value" in capture.content
      ? JSON.stringify(capture.content.value)
      : `absence: ${capture.content.absence}`;
  const provenance =
    capture.evidence !== undefined
      ? capture.evidence.map((evidence) => `“${evidence.excerpt}”`).join("; ")
      : capture.basis === undefined
        ? "no provenance"
        : `${capture.basis.type}: ${capture.basis.description}`;
  const history = [
    capture.alternativeGroup === undefined
      ? undefined
      : `alternative group ${capture.alternativeGroup}`,
    capture.supersedes === undefined
      ? undefined
      : `supersedes ${capture.supersedes}`,
  ].filter((fact) => fact !== undefined);
  return `Capture ${capture.id} (${capture.status}; ${capture.epistemicStatus}; confidence ${capture.confidence}): ${content} — ${provenance}${history.length === 0 ? "" : `; ${history.join("; ")}`}`;
};

const formatCompletion = (report: SweepCompletionReport): string[] => [
  `Completion: ${report.complete ? "complete" : "incomplete"} · plugin ${report.pluginVersion} · revision ${report.revision}`,
  `Completion slice: ${report.sliceNodeIds.join(", ") || "none"}`,
  ...report.failures.map(formatFailure),
  ...report.outsideSlice.flatMap((node) => [
    `Outside completion slice: ${node.nodeId} (${node.kind}); ${node.open.length} open requirement${node.open.length === 1 ? "" : "s"}`,
    ...node.open.map((failure) => `Outside-slice ${formatFailure(failure)}`),
  ]),
];

const summarizeSweepOutput = (
  output: unknown,
):
  | {
      readonly title: string;
      readonly detail: string;
      readonly items?: readonly string[];
    }
  | undefined => {
  const parsed = sweepOutputSchema.safeParse(output);
  if (!parsed.success) return undefined;

  const sweep = parsed.data;
  switch (sweep.status) {
    case "no-settled-range":
      return {
        title: "No settled range to sweep",
        detail: "The conversation has no settled user entries.",
      };
    case "refused":
      return {
        title: "Sweep refused",
        detail: sweep.refusal.message,
        items: [`Refusal: ${sweep.refusal.code}`],
      };
    case "applied":
      return {
        title: "Sweep applied",
        detail: `${sweep.appliedCaptureIds.length} new capture${sweep.appliedCaptureIds.length === 1 ? "" : "s"} · ${sweep.captures.length} total · ${sweep.completion?.complete === true ? "complete" : "incomplete"}`,
        items: [
          ...sweep.captures.map(formatCapture),
          ...(sweep.completion === undefined
            ? []
            : formatCompletion(sweep.completion)),
        ],
      };
  }
};

const decorateBrunchStream = (
  stream: ReadableStream<UIMessageChunk>,
): ReadableStream<UIMessageChunk> => {
  const toolNamesByCallId = new Map<string, string>();
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (chunk.type === "tool-input-available") {
          toolNamesByCallId.set(chunk.toolCallId, chunk.toolName);
        }
        if (
          chunk.type === "tool-output-available" &&
          toolNamesByCallId.get(chunk.toolCallId) === SWEEP_TOOL_NAME
        ) {
          const summary = summarizeSweepOutput(chunk.output);
          if (
            summary !== undefined &&
            typeof chunk.output === "object" &&
            chunk.output !== null
          ) {
            controller.enqueue({
              ...chunk,
              output: { ...chunk.output, ...summary },
            });
            return;
          }
        }
        controller.enqueue(chunk);
      },
    }),
  );
};

/**
 * Pin Petrinaut's stock transport to one stable conversation id so reload,
 * client-tool follow-up, and the voice dock share Flue's conversation.
 */
export const createBrunchPanelTransport = (
  transport: PetrinautAiChatTransport,
  conversationId: string,
): PetrinautAiChatTransport => ({
  reconnectToStream: async (options) => {
    const stream = await transport.reconnectToStream({
      ...options,
      chatId: conversationId,
    });
    return stream === null ? null : decorateBrunchStream(stream);
  },
  sendMessages: async (options) =>
    decorateBrunchStream(
      await transport.sendMessages({
        ...options,
        chatId: conversationId,
      }),
    ),
});
