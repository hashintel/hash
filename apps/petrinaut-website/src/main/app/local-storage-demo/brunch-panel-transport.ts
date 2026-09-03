import { createFlueChatTransport } from "@hashintel/brunch-agent-transport-aisdk";
import { SWEEP_TOOL_NAME } from "@hashintel/brunch-agent/client-tools";

import { sweepOutputSchema } from "../brunch-sweep-output";
import { brunchClientToolNames } from "./brunch-client-tools";

import type {
  SweepCapture,
  SweepCompletionFailure,
  SweepCompletionReport,
} from "../brunch-sweep-output";
import type { AgentSendResult, FlueClient } from "@flue/sdk";
import type { FlueChatTransportOptions } from "@hashintel/brunch-agent-transport-aisdk";
import type { PetrinautAiChatTransport } from "@hashintel/petrinaut/ui";
import type { UIMessageChunk } from "ai";

export type BrunchPanelAdmission = Parameters<
  NonNullable<FlueChatTransportOptions["onAdmission"]>
>[0];
export type BrunchPanelAdmissionTarget = Pick<
  BrunchPanelAdmission,
  "kind" | "messageId"
>;

export class BrunchPanelConversationTracker {
  readonly #admissionSubscriptions = new Set<{
    readonly listener: (admission: BrunchPanelAdmission) => void;
    readonly target: BrunchPanelAdmissionTarget;
  }>();
  readonly #inFlightSubmissions = new Set<Promise<unknown>>();
  readonly #inputSubmissions = new Map<
    string,
    AgentSendResult["submissionId"]
  >();
  readonly #responseSubmissions = new Map<
    string,
    AgentSendResult["submissionId"][]
  >();

  public recordAdmission(admission: BrunchPanelAdmission): void {
    if (admission.kind === "user") {
      this.#inputSubmissions.set(
        admission.messageId,
        admission.admission.submissionId,
      );
    }
    for (const subscription of this.#admissionSubscriptions) {
      if (
        subscription.target.kind === admission.kind &&
        subscription.target.messageId === admission.messageId
      ) {
        this.#admissionSubscriptions.delete(subscription);
        subscription.listener(admission);
      }
    }
  }

  /**
   * A client-tool continuation is projected onto the assistant message it
   * resumes, so one message can be written by several submissions. Keep them
   * all: Voice correlates a reply by membership, whichever side admitted the
   * continuation.
   */
  public recordResponse(
    messageId: string,
    submissionId: AgentSendResult["submissionId"],
  ): void {
    const recorded = this.#responseSubmissions.get(messageId);
    if (recorded === undefined) {
      this.#responseSubmissions.set(messageId, [submissionId]);
    } else if (!recorded.includes(submissionId)) {
      recorded.push(submissionId);
    }
  }

  /**
   * Resolves once every submission currently between `send()` and its
   * admission has been admitted or rejected, so a conversation-wide abort
   * issued afterwards has a settled target rather than racing the admission.
   */
  public settleInFlightSubmissions(): Promise<void> {
    return Promise.allSettled(this.#inFlightSubmissions).then(() => undefined);
  }

  public trackSubmission<T>(submission: Promise<T>): Promise<T> {
    this.#inFlightSubmissions.add(submission);
    const release = (): void => {
      this.#inFlightSubmissions.delete(submission);
    };
    submission.then(release, release);
    return submission;
  }

  public submissionForInput(
    messageId: string,
  ): AgentSendResult["submissionId"] | undefined {
    return this.#inputSubmissions.get(messageId);
  }

  public submissionsForResponse(
    messageId: string,
  ): readonly AgentSendResult["submissionId"][] | undefined {
    return this.#responseSubmissions.get(messageId);
  }

  public subscribeToAdmission(
    target: BrunchPanelAdmissionTarget,
    listener: (admission: BrunchPanelAdmission) => void,
  ): () => void {
    const subscription = { listener, target };
    this.#admissionSubscriptions.add(subscription);
    return () => this.#admissionSubscriptions.delete(subscription);
  }
}

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

/** Adapt one mounted Flue conversation to Petrinaut's AI SDK rendering contract. */
export const createBrunchPanelTransport = (
  clientPromise: Promise<FlueClient>,
  tracker: BrunchPanelConversationTracker,
  options?: {
    /** Fixture-scoped client tools; defaults to the Petrinaut docs reader alone. */
    readonly clientToolNames?: ReadonlySet<string>;
    readonly onAdmission?: (admission: AgentSendResult) => void;
  },
): PetrinautAiChatTransport => ({
  reconnectToStream: async () => null,
  sendMessages: (sendOptions) =>
    tracker.trackSubmission(
      (async () => {
        const client = await clientPromise;
        const transport = createFlueChatTransport({
          client,
          clientToolNames: options?.clientToolNames ?? brunchClientToolNames,
          onAdmission: (event) => {
            tracker.recordAdmission(event);
            options?.onAdmission?.(event.admission);
          },
          onResponseMessage: ({ messageId, submissionId }) =>
            tracker.recordResponse(messageId, submissionId),
        });
        return decorateBrunchStream(await transport.sendMessages(sendOptions));
      })(),
    ),
});

export const createUnavailableBrunchPanelTransport = (
  reason: string,
): PetrinautAiChatTransport => ({
  reconnectToStream: async () => null,
  sendMessages: async () => {
    throw new Error(reason);
  },
});
