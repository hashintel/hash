import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  browserToolMutatesDocument,
  canonicalContent,
  type DraftPetrinautExperimentInput,
  draftPetrinautExperimentInputSchema,
  type DraftPetrinautExperimentOutput,
  draftPetrinautExperimentOutputSchema,
  parseClientToolResultMetadata,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { brunchTools } from "@hashintel/brunch-agent/constants";
import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  prepareExperiment,
  useStore,
  type PluginDocumentReader,
  type PluginExperiments,
} from "@hashintel/petrinaut/ui";

import { ExperimentExecutionCard } from "../../_shared/chat/experiment-execution-card";
import {
  definePetrinautAiInteractiveTool,
  type PetrinautAiInteractiveToolWidgetProps,
} from "../../_shared/chat/interactive-tool";
import { canonicalPetrinautClientToolNames } from "./brunch-client-tools";
import {
  describeBudget,
  describeExperiment,
  metricRoles,
  nameOfMetric,
  preparationDiffers,
  summarizeForAgent,
} from "./brunch-draft-experiment-interactive-tool/describe-draft";
import { documentRevisionOf } from "./shared/document-revision";

import type {
  EditorDrafts,
  PreparedExperiment,
} from "../shared/brunch-draft-experiment-drafts";
import type { createInBandBrowserCalls } from "./in-band-browser-call";
import type { FlueConversationState } from "@flue/sdk";
import type {
  PetrinautExperimentRequest,
  SDCPN,
} from "@hashintel/petrinaut-core";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "lg",
  backgroundColor: "neutral.s00",
});

const statusStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "medium",
  letterSpacing: "wide",
  textTransform: "uppercase",
});

const titleStyle = css({
  color: "neutral.s100",
  fontSize: "sm",
  fontWeight: "semibold",
});

const bodyStyle = css({
  color: "neutral.s90",
  fontSize: "sm",
  lineHeight: "relaxed",
});

const sectionLabelStyle = css({
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
  marginTop: "1",
});

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  paddingLeft: "4",
  color: "neutral.s90",
  fontSize: "xs",
  lineHeight: "relaxed",
  listStyleType: "disc",
});

const tagStyle = css({
  marginLeft: "1",
  paddingX: "1",
  borderRadius: "sm",
  backgroundColor: "neutral.a10",
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
});

const noticeStyle = css({
  padding: "2",
  borderRadius: "md",
  backgroundColor: "yellow.a10",
  color: "neutral.s100",
  fontSize: "xs",
  lineHeight: "relaxed",
});

const errorStyle = css({
  padding: "2",
  borderRadius: "md",
  backgroundColor: "red.a10",
  color: "neutral.s100",
  fontSize: "xs",
  lineHeight: "relaxed",
});

const actionsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "2",
  justifyContent: "flex-end",
  marginTop: "1",
});

/** Resolve only the history before the exact issued call, never a model-supplied citation. */
export const resolveDraftAuthorityFromHistory = async (
  snapshot: FlueConversationState,
  draftCallId: string,
): Promise<string> => {
  const positions = snapshot.messages.flatMap((message, messageIndex) =>
    message.role === "assistant" && message.purpose === "assistant"
      ? message.parts.flatMap((part, partIndex) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === draftCallId &&
          part.toolName === brunchTools.draftPetrinautExperiment
            ? [{ messageIndex, partIndex }]
            : [],
        )
      : [],
  );
  const position = positions[0];
  if (!position)
    throw new Error("Issued draft is absent from conversation history.");
  const message = snapshot.messages[position.messageIndex];
  if (!message) throw new Error("Draft history is incomplete.");
  const prefix = {
    ...snapshot,
    messages: [
      ...snapshot.messages.slice(0, position.messageIndex),
      { ...message, parts: message.parts.slice(0, position.partIndex) },
    ],
  } satisfies FlueConversationState;
  const calls = prefix.messages.flatMap((entry) =>
    entry.role === "assistant" && entry.purpose === "assistant"
      ? entry.parts.filter((part) => part.type === "dynamic-tool")
      : [],
  );
  // The draft must follow a net read with no document change after it.
  const relevant = calls.filter(
    (call) =>
      canonicalPetrinautClientToolNames.has(call.toolName) &&
      (call.toolName === "getLatestNetDefinition" ||
        browserToolMutatesDocument(call.toolName)),
  );
  const latest = relevant.at(-1);
  if (
    latest?.toolName !== "getLatestNetDefinition" ||
    latest.state !== "output-available"
  )
    throw new Error(
      "The AI assistant needs to read the latest model before drafting.",
    );
  const envelope = latest.output;
  const metadata =
    typeof envelope === "object" && envelope !== null && "metadata" in envelope
      ? parseClientToolResultMetadata(envelope.metadata)
      : undefined;
  const revision = metadata?.documentRevision.before;
  if (revision === undefined)
    throw new Error(
      "The AI assistant’s latest model read has no document revision.",
    );
  return revision;
};

/** What the card reads and runs: the plugin's document, its experiments and its drafts. */
interface DraftExperimentPorts {
  readonly document: Pick<PluginDocumentReader, "net" | "title" | "reveal">;
  readonly experiments: PluginExperiments;
  readonly editorDrafts: EditorDrafts;
}

type WidgetProps = PetrinautAiInteractiveToolWidgetProps<
  DraftPetrinautExperimentInput,
  DraftPetrinautExperimentOutput
> &
  DraftExperimentPorts;

// `false` is a disclosed reporting-only semantic judgment, not host-verified consent.
// Hard restrictions and omitted blocksRun fail closed; no request constraints are enforced.
const conditionBlocksRun = (
  condition: DraftPetrinautExperimentInput["unsupported"][number],
) => condition.blocksRun !== false;

// Two stable snapshots rather than one fresh object: useSyncExternalStore
// compares snapshots by identity and would re-render without end otherwise.
const useEditorDraft = (editorDrafts: EditorDrafts, toolCallId: string) => {
  const draft = useSyncExternalStore(editorDrafts.subscribe, () =>
    editorDrafts.get().drafts.get(toolCallId),
  );
  const isCurrent = useSyncExternalStore(
    editorDrafts.subscribe,
    () => editorDrafts.get().currentToolCallId === toolCallId,
  );
  return { draft, isCurrent };
};

const prepareOrExplain = (
  request: PetrinautExperimentRequest,
  definition: Parameters<typeof prepareExperiment>[1],
  title: string,
):
  | { prepared: PreparedExperiment; error: null }
  | { prepared: null; error: string } => {
  try {
    return {
      prepared: prepareExperiment(request, definition, title),
      error: null,
    };
  } catch (caught) {
    return {
      prepared: null,
      error: caught instanceof Error ? caught.message : String(caught),
    };
  }
};

/**
 * The card itself: it reads the live net and runs through the plugin's
 * experiments. Exported for direct rendering in tests; the app mounts it
 * through the interactive-tool definition below.
 */
export const BrunchDraftExperimentWidget = ({
  input,
  document,
  experiments,
  editorDrafts,
  readDraftAuthority,
  state,
  claimAndSubmit,
  toolCallId,
}: WidgetProps & {
  readDraftAuthority: (toolCallId: string) => Promise<string>;
  /** Claim the issued call, then submit what `prepareOutput` resolves to, so the lease covers preparation. */
  claimAndSubmit: (
    prepareOutput: () => Promise<DraftPetrinautExperimentOutput>,
  ) => Promise<void>;
}) => {
  const liveDefinition = useStore(document.net);
  const records = useStore(experiments.records);
  const optimizationUnavailableReason = useStore(
    experiments.optimizationUnavailableReason,
  );
  const executionUnavailable =
    input.experiment.execution.mode === "optimize"
      ? optimizationUnavailableReason
      : null;
  const { draft, isCurrent } = useEditorDraft(editorDrafts, toolCallId);
  const preparedOnceRef = useRef(false);
  const [reviewed, setReviewed] = useState<{
    prepared: PreparedExperiment;
    definition: SDCPN;
  } | null>(null);
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [submitFailure, setSubmitFailure] = useState<string | null>(null);
  const [submissionPending, setSubmissionPending] = useState(
    state === "awaiting",
  );

  // A freshly streamed call prepares once against the live model and reports
  // back so Brunch's turn can continue. Run and Dismiss come after and are
  // not reported through the tool result.
  useEffect(() => {
    if (state !== "awaiting" || preparedOnceRef.current) return;
    preparedOnceRef.current = true;
    let candidate: Parameters<typeof editorDrafts.register>[0] | undefined;
    const prepareOutput = async (): Promise<DraftPetrinautExperimentOutput> => {
      let definition = document.net.get();
      let outcome: ReturnType<typeof prepareOrExplain>;
      try {
        const readRevision = await readDraftAuthority(toolCallId);
        definition = document.net.get();
        outcome =
          documentRevisionOf(definition) === readRevision
            ? prepareOrExplain(
                input.experiment,
                definition,
                document.title.get(),
              )
            : {
                prepared: null,
                error:
                  "The model changed since the AI assistant read it. Ask it to draft again.",
              };
      } catch (caught) {
        outcome = {
          prepared: null,
          error: caught instanceof Error ? caught.message : String(caught),
        };
      }
      candidate = {
        toolCallId,
        input,
        definition,
        prepared: outcome.prepared,
        invalid: outcome.error,
        dismissed: false,
        run: { phase: "idle" as const },
      };
      const submissionDraft =
        editorDrafts.get().drafts.get(toolCallId) ?? candidate;
      const unavailable =
        input.experiment.execution.mode === "optimize"
          ? experiments.optimizationUnavailableReason.get()
          : null;
      return submissionDraft.prepared
        ? {
            status: "drafted",
            summary: `${summarizeForAgent(
              submissionDraft.prepared,
              submissionDraft.definition,
              submissionDraft.input.unsupported.length,
            )}${
              unavailable === null
                ? ""
                : ` Execution unavailable: ${unavailable}.`
            }`,
            diagnostics: [
              "No constraints or constraint policy are carried; nothing is enforced.",
              ...submissionDraft.input.unsupported.map(
                (condition) =>
                  `${conditionBlocksRun(condition) ? "Run blocked" : "Not carried"}: ${condition.condition}`,
              ),
              ...(unavailable === null
                ? []
                : [`Execution unavailable: ${unavailable}`]),
            ],
          }
        : {
            status: "invalid",
            summary: `The browser could not prepare this experiment against the current model: ${submissionDraft.invalid}`,
            diagnostics: [submissionDraft.invalid ?? "Preparation failed"],
          };
    };
    const submitAndRegister = async () => {
      try {
        await claimAndSubmit(prepareOutput);
      } catch (caught) {
        setSubmitFailure(
          caught instanceof Error ? caught.message : String(caught),
        );
        setSubmissionPending(false);
        return;
      }
      if (candidate) editorDrafts.register(candidate);
      setSubmissionPending(false);
    };
    void submitAndRegister();
  }, [
    input,
    document,
    experiments,
    readDraftAuthority,
    editorDrafts,
    state,
    claimAndSubmit,
    toolCallId,
  ]);

  const definition =
    reviewed?.definition ?? draft?.definition ?? liveDefinition;
  const displayedPrepared = reviewed?.prepared ?? draft?.prepared ?? null;
  const request = displayedPrepared?.request ?? null;
  const blocksRun = input.unsupported.some(conditionBlocksRun);
  const optimizationUnavailable =
    request?.execution.mode === "optimize" ? executionUnavailable : null;

  const onRun = async () => {
    // Read synchronously, not from the render closure: duplicate clicks or a
    // remounted copy of the same card must never start a second experiment.
    const latest = editorDrafts.get();
    const pending = latest.drafts.get(toolCallId);
    if (
      !pending?.prepared ||
      latest.currentToolCallId !== toolCallId ||
      pending.dismissed ||
      (pending.run.phase !== "idle" && pending.run.phase !== "failed") ||
      pending.input.unsupported.some(conditionBlocksRun) ||
      optimizationUnavailable !== null
    )
      return;
    // Prepare again against the model as it is now: Run must start what the
    // person sees, and a changed metric or parameter is shown before any call.
    const currentDefinition = structuredClone(document.net.get());
    const current = prepareOrExplain(
      pending.prepared.request,
      currentDefinition,
      document.title.get(),
    );
    if (!current.prepared) {
      setRunError(current.error);
      return;
    }
    if (
      preparationDiffers(
        reviewed?.prepared ?? pending.prepared,
        current.prepared,
      ) ||
      canonicalContent(reviewed?.definition ?? pending.definition) !==
        canonicalContent(currentDefinition)
    ) {
      setReviewed({
        prepared: current.prepared,
        definition: currentDefinition,
      });
      setReviewAccepted(false);
      setRunError(null);
      return;
    }
    if (reviewed && !reviewAccepted) return;
    setRunError(null);
    // The accepted model becomes the draft's own below, so a later failure
    // shows the run error instead of an empty model-change review.
    setReviewed(null);
    setReviewAccepted(false);
    const controller = new AbortController();
    editorDrafts.update(toolCallId, {
      prepared: current.prepared,
      definition: currentDefinition,
      run: { phase: "running", controller, progress: null },
    });
    try {
      const result = await experiments.run(current.prepared.request, {
        signal: controller.signal,
        onProgress: (progress) =>
          editorDrafts.update(toolCallId, {
            run: { phase: "running", controller, progress },
          }),
      });
      editorDrafts.update(toolCallId, {
        run:
          result.status === "error"
            ? {
                phase: "failed",
                message: result.message ?? "The experiment failed.",
                result,
              }
            : { phase: "finished", result },
      });
    } catch (caught) {
      editorDrafts.update(toolCallId, {
        run: {
          phase: "failed",
          message: caught instanceof Error ? caught.message : String(caught),
        },
      });
    }
  };

  const heading = !draft
    ? submissionPending
      ? "Preparing draft"
      : submitFailure !== null
        ? "Draft could not be submitted"
        : "Not retained in this editor"
    : draft.invalid !== null
      ? "Could not be prepared"
      : draft.dismissed
        ? "Dismissed"
        : draft.run.phase === "failed"
          ? "Run failed"
          : isCurrent
            ? "Drafted — not run · not saved with the document"
            : "Superseded by a later draft";

  const canAct =
    draft !== undefined &&
    draft.invalid === null &&
    !draft.dismissed &&
    isCurrent &&
    (draft.run.phase === "idle" || draft.run.phase === "failed");
  const canRun = canAct && optimizationUnavailable === null;
  const run = draft?.run;
  const runResult =
    run?.phase === "finished" || run?.phase === "failed"
      ? run.result
      : undefined;
  const experimentId =
    run?.phase === "running"
      ? run.progress?.experimentId
      : runResult?.experimentId;
  const canViewExperiment =
    experimentId && records.some((record) => record.id === experimentId);

  if (
    run &&
    run.phase !== "idle" &&
    draft.prepared &&
    !draft.dismissed &&
    !(run.phase === "failed" && (reviewed || runError))
  ) {
    return (
      <ExperimentExecutionCard
        request={draft.prepared.request}
        active={run.phase === "running"}
        progress={
          run.phase === "running" ? (run.progress ?? undefined) : undefined
        }
        result={runResult}
        error={run.phase === "failed" ? run.message : undefined}
        onCancel={
          run.phase === "running" ? () => run.controller.abort() : undefined
        }
        onRetry={
          run.phase === "failed" && canRun ? () => void onRun() : undefined
        }
        onViewExperiment={
          canViewExperiment
            ? () =>
                document.reveal({
                  kind: "simulateView",
                  mode: "experiments",
                  itemId: experimentId,
                })
            : undefined
        }
      />
    );
  }

  return (
    <section
      className={containerStyle}
      aria-label="Drafted experiment"
      data-draft-status={heading}
    >
      <p className={statusStyle}>{heading}</p>
      <p className={titleStyle}>{input.experiment.name}</p>
      {displayedPrepared ? (
        <>
          <p className={bodyStyle}>
            {describeExperiment(displayedPrepared, definition)}
          </p>
          <p className={bodyStyle}>
            {describeBudget(displayedPrepared.request)}
          </p>
          <p className={sectionLabelStyle}>Metrics</p>
          <ul className={listStyle}>
            {metricRoles(displayedPrepared.request, definition).map(
              (metric) => (
                <li key={metric.metricId}>
                  {metric.name}
                  <span className={tagStyle}>
                    {metric.role === "objective"
                      ? "objective"
                      : "reported, not enforced"}
                  </span>
                </li>
              ),
            )}
          </ul>
        </>
      ) : (
        <p className={bodyStyle}>
          {draft?.invalid ??
            (submissionPending
              ? "This experiment proposal is being prepared."
              : submitFailure !== null
                ? `The prepared proposal could not be submitted: ${submitFailure}`
                : "This draft is from an earlier session. Ask the AI assistant to draft it again to run it.")}
        </p>
      )}
      <p className={sectionLabelStyle}>Declared</p>
      <ul className={listStyle}>
        {input.declarations.map((declaration) => (
          <li key={`${declaration.subject}:${declaration.statement}`}>
            <strong>{declaration.subject}</strong>: {declaration.statement}
          </li>
        ))}
      </ul>
      <p className={sectionLabelStyle}>Not carried into execution</p>
      {input.unsupported.length === 0 ? (
        <p className={bodyStyle}>
          No restrictions were stated, so none are enforced.
        </p>
      ) : (
        <ul className={listStyle}>
          {input.unsupported.map((condition) => (
            <li key={condition.condition}>
              {condition.condition} — {condition.reason}
              {condition.reportedByMetricId ? (
                <span className={tagStyle}>
                  reported by{" "}
                  {nameOfMetric(definition, condition.reportedByMetricId)}, not
                  enforced
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {blocksRun ? (
        <p className={noticeStyle} role="alert">
          Can’t run: a restriction isn’t supported. Ask the AI assistant to
          revise the proposal, or tell it you accept a run that only reports on
          it.
        </p>
      ) : null}
      {optimizationUnavailable !== null ? (
        <p className={errorStyle} role="alert">
          {optimizationUnavailable}
        </p>
      ) : null}
      {runError ? (
        <p className={errorStyle} role="alert">
          {runError}
        </p>
      ) : null}
      {reviewed && draft && canAct ? (
        <div className={noticeStyle}>
          <p role="status">
            The model changed since this was drafted. Review the changes below
            before running, or ask the AI assistant to draft it again.
          </p>
          <details>
            <summary>Review model changes</summary>
            {Object.keys({ ...draft.definition, ...reviewed.definition }).map(
              (section) => {
                const before = draft.definition[section as keyof SDCPN];
                const after = reviewed.definition[section as keyof SDCPN];
                if (canonicalContent(before) === canonicalContent(after))
                  return null;
                return (
                  <div key={section}>
                    <strong>{section}</strong>
                    <pre
                      className={css({
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                      })}
                    >
                      {`Before: ${before === undefined ? "not set" : JSON.stringify(before, null, 2)}\nAfter: ${after === undefined ? "removed" : JSON.stringify(after, null, 2)}`}
                    </pre>
                  </div>
                );
              },
            )}
          </details>
        </div>
      ) : null}
      {canAct ? (
        <div className={actionsStyle}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => editorDrafts.update(toolCallId, { dismissed: true })}
            type="button"
          >
            Dismiss
          </Button>
          {canRun ? (
            reviewed && !reviewAccepted ? (
              <Button
                size="sm"
                tone="brand"
                disabled={blocksRun}
                onClick={() => setReviewAccepted(true)}
                type="button"
              >
                Accept current model
              </Button>
            ) : (
              <Button
                size="sm"
                tone="brand"
                disabled={blocksRun}
                onClick={() => void onRun()}
                type="button"
              >
                {draft.run.phase === "failed"
                  ? reviewed
                    ? "Retry against current model"
                    : "Retry run"
                  : reviewed
                    ? "Run against current model"
                    : "Run"}
              </Button>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

/**
 * The server awaits the draft call in band: claim the issued call, prepare
 * under its renewed lease, then settle it with the preparation result. A draft
 * changes no document, so a failed settlement is reported as failed, never as
 * an unknown document effect.
 */
const settleIssuedDraft = async (
  browserCalls: ReturnType<typeof createInBandBrowserCalls>,
  call: { readonly toolCallId: string; readonly input: unknown },
  prepareOutput: () => Promise<DraftPetrinautExperimentOutput>,
) => {
  const issued = await browserCalls.claim({
    ...call,
    toolName: brunchTools.draftPetrinautExperiment,
    signal: new AbortController().signal,
  });
  try {
    await issued.submit(await prepareOutput());
  } catch (error) {
    await issued.fail("failed").catch(() => {});
    throw error;
  }
};

/**
 * The website-owned card for a Brunch-drafted experiment. It prepares the
 * proposal against the live model, tells Brunch it is drafted (not run), and
 * lets the person Run or Dismiss it. Run goes through the plugin's
 * experiments, so records, the active indicator and the Experiments view
 * behave as shipped. Only View experiment navigates; drafts stay in the
 * plugin's memory.
 */
export const createBrunchDraftExperimentInteractiveTool = ({
  browserCalls,
  readDraftAuthority,
  ...ports
}: DraftExperimentPorts & {
  browserCalls: ReturnType<typeof createInBandBrowserCalls>;
  readDraftAuthority: (toolCallId: string) => Promise<string>;
}) =>
  definePetrinautAiInteractiveTool<
    DraftPetrinautExperimentInput,
    DraftPetrinautExperimentOutput
  >({
    toolName: brunchTools.draftPetrinautExperiment,
    placement: "card",
    inputSchema: draftPetrinautExperimentInputSchema,
    outputSchema: draftPetrinautExperimentOutputSchema,
    component: (props) => (
      <BrunchDraftExperimentWidget
        {...props}
        {...ports}
        claimAndSubmit={(prepareOutput) =>
          settleIssuedDraft(
            browserCalls,
            { toolCallId: props.toolCallId, input: props.input },
            prepareOutput,
          )
        }
        readDraftAuthority={readDraftAuthority}
      />
    ),
  });
