import { use, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  canonicalContent,
  type DraftPetrinautExperimentInput,
  draftPetrinautExperimentInputSchema,
  type DraftPetrinautExperimentOutput,
  draftPetrinautExperimentOutputSchema,
  draftPetrinautExperimentToolName,
  parseClientToolResultMetadata,
  type BrowserBinding,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { css } from "@hashintel/ds-helpers/css";
import {
  ExperimentHostContext,
  ExperimentsContext,
  openPetrinautSimulationResource,
  OptimizationsContext,
  prepareExperiment,
  usePetrinautInstance,
  usePetrinautNavigation,
} from "@hashintel/petrinaut/react";
import {
  definePetrinautAiInteractiveTool,
  ExperimentExecutionCard,
  type PetrinautAiInteractiveToolWidgetProps,
} from "@hashintel/petrinaut/ui";

import { canonicalPetrinautClientToolNames } from "./brunch-client-tools";
import {
  describeBudget,
  describeExperiment,
  metricRoles,
  preparationDiffers,
  summarizeForAgent,
} from "./brunch-draft-experiment-interactive-tool/describe-draft";
import {
  resetEditorDrafts,
  editorDraftsFor,
} from "./brunch-draft-experiment-interactive-tool/editor-drafts";
import {
  foldBrunchWorkpieceHistory,
  settledBrunchWorkpieceRevisionFrom,
} from "./brunch-workpiece-history";

import type { PreparedExperiment } from "./brunch-draft-experiment-interactive-tool/describe-draft";
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
  color: "neutral.s80",
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
  gap: "2",
  justifyContent: "flex-end",
  marginTop: "1",
});

const primaryButtonStyle = css({
  paddingX: "3",
  paddingY: "2",
  borderRadius: "md",
  backgroundColor: "blue.a85",
  color: "white",
  cursor: "pointer",
  fontSize: "sm",
  fontWeight: "medium",
  _hover: { backgroundColor: "blue.a100" },
  _disabled: { cursor: "not-allowed", opacity: 0.45 },
});

const secondaryButtonStyle = css({
  paddingX: "3",
  paddingY: "2",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
  color: "neutral.s90",
  cursor: "pointer",
  fontSize: "sm",
  fontWeight: "medium",
  _hover: { backgroundColor: "neutral.a10" },
});

/** Forget every draft, as a reload would. For tests that share the module. */
export const resetBrunchEditorDrafts = resetEditorDrafts;

/** Resolve only the history before the exact issued call, never a model-supplied citation. */
export const resolveDraftAuthorityFromHistory = async (
  snapshot: FlueConversationState,
  binding: BrowserBinding,
  draftCallId: string,
): Promise<string> => {
  const positions = snapshot.messages.flatMap((message, messageIndex) =>
    message.role === "assistant" && message.purpose === "assistant"
      ? message.parts.flatMap((part, partIndex) =>
          part.type === "dynamic-tool" &&
          part.toolCallId === draftCallId &&
          part.toolName === draftPetrinautExperimentToolName
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
  const ledger = settledBrunchWorkpieceRevisionFrom(
    foldBrunchWorkpieceHistory(prefix.messages, binding),
  );
  if (!ledger)
    throw new Error("Draft requires a current settled Ledger basis.");
  const relevant = calls.filter(
    (call) =>
      canonicalPetrinautClientToolNames.has(call.toolName) &&
      call.toolName !== "getNetCompilationErrors" &&
      call.toolName !== "readPetrinautDoc" &&
      call.toolName !== "createExperiment",
  );
  const latest = relevant.at(-1);
  if (
    latest?.toolName !== "getLatestNetDefinition" ||
    latest.state !== "output-available"
  )
    throw new Error(
      "Draft requires the latest settled canonical net read after changes.",
    );
  const envelope = latest.output;
  const metadata =
    typeof envelope === "object" && envelope !== null && "metadata" in envelope
      ? parseClientToolResultMetadata(envelope.metadata)
      : undefined;
  const revision = metadata?.documentRevision.before;
  if (revision === undefined)
    throw new Error("The latest canonical read has no document revision.");
  return revision;
};

type WidgetProps = PetrinautAiInteractiveToolWidgetProps<
  DraftPetrinautExperimentInput,
  DraftPetrinautExperimentOutput
>;

// `false` is a disclosed reporting-only semantic judgment, not host-verified consent.
// Hard restrictions and omitted blocksRun fail closed; no request constraints are enforced.
const conditionBlocksRun = (
  condition: DraftPetrinautExperimentInput["unsupported"][number],
) => condition.blocksRun !== false;

// Two stable snapshots rather than one fresh object: useSyncExternalStore
// compares snapshots by identity and would re-render without end otherwise.
const useEditorDraft = (
  editorDrafts: ReturnType<typeof editorDraftsFor>,
  toolCallId: string,
) => {
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
 * The card itself, rendered inside Petrinaut's tree so it can read the live
 * definition and the stock experiment host. Exported for direct rendering in
 * tests; the app mounts it through the interactive-tool definition below.
 */
export const BrunchDraftExperimentWidget = ({
  input,
  readTitle,
  readDraftAuthority,
  state,
  submitAndWait,
  toolCallId,
}: WidgetProps & {
  readTitle: () => string;
  readDraftAuthority: (toolCallId: string) => Promise<string>;
}) => {
  const instance = usePetrinautInstance();
  const experimentHost = use(ExperimentHostContext);
  const { experiments } = use(ExperimentsContext);
  const { navigate } = usePetrinautNavigation();
  const optimizationUnavailableReason =
    use(OptimizationsContext).optimizationUnavailableReason ?? null;
  const executionUnavailable =
    input.experiment.execution.mode === "optimize"
      ? optimizationUnavailableReason
      : null;
  const editorDrafts = editorDraftsFor(instance.definition);
  const { draft, isCurrent } = useEditorDraft(editorDrafts, toolCallId);
  const preparedOnceRef = useRef(false);
  const [reviewed, setReviewed] = useState<{
    prepared: PreparedExperiment;
    definition: SDCPN;
  } | null>(null);
  const [reviewAccepted, setReviewAccepted] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [submissionAttempt, setSubmissionAttempt] = useState(0);
  const [preparationFailure, setPreparationFailure] = useState<{
    kind: "prepare" | "submit";
    message: string;
  } | null>(null);
  const [submissionPending, setSubmissionPending] = useState(
    state === "awaiting" && submitAndWait !== undefined,
  );

  // A freshly streamed call prepares once against the live model and reports
  // back so Brunch's turn can continue. Run and Dismiss come after and are
  // not reported through the tool result.
  useEffect(() => {
    if (
      state !== "awaiting" ||
      preparedOnceRef.current ||
      submitAndWait === undefined
    )
      return;
    preparedOnceRef.current = true;
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- this effect starts the one live-model preparation and marks it pending
    setPreparationFailure(null);
    setSubmissionPending(true);
    const initialDefinition = instance.handle.doc();
    if (!initialDefinition) {
      setPreparationFailure({
        kind: "prepare",
        message: "The bound browser document is unavailable.",
      });
      setSubmissionPending(false);
      return;
    }
    const submitAndRegister = async () => {
      let definition: SDCPN = initialDefinition;
      let outcome: ReturnType<typeof prepareOrExplain>;
      try {
        const readRevision = await readDraftAuthority(toolCallId);
        const latestDefinition = instance.handle.doc();
        if (latestDefinition) definition = latestDefinition;
        outcome =
          latestDefinition && instance.handle.revisionId.get() === readRevision
            ? prepareOrExplain(input.experiment, definition, readTitle())
            : {
                prepared: null,
                error:
                  "The model changed since the canonical read. Ask Brunch to read the current model and draft again.",
              };
      } catch (caught) {
        outcome = {
          prepared: null,
          error: caught instanceof Error ? caught.message : String(caught),
        };
      }
      const candidate = {
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
      const output: DraftPetrinautExperimentOutput = submissionDraft.prepared
        ? {
            status: "drafted",
            summary: `${summarizeForAgent(
              submissionDraft.prepared,
              submissionDraft.definition,
              submissionDraft.input.unsupported.length,
            )}${
              executionUnavailable === null
                ? ""
                : ` Execution unavailable: ${executionUnavailable}.`
            }`,
            diagnostics: [
              "No constraints or constraint policy are carried; nothing is enforced.",
              ...submissionDraft.input.unsupported.map(
                (condition) =>
                  `${conditionBlocksRun(condition) ? "Run blocked" : "Not carried"}: ${condition.condition}`,
              ),
              ...(executionUnavailable === null
                ? []
                : [`Execution unavailable: ${executionUnavailable}`]),
            ],
          }
        : {
            status: "invalid",
            summary: `The browser could not prepare this experiment against the current model: ${submissionDraft.invalid}`,
            diagnostics: [submissionDraft.invalid ?? "Preparation failed"],
          };
      try {
        await submitAndWait(output);
      } catch (caught) {
        setPreparationFailure({
          kind: "submit",
          message: caught instanceof Error ? caught.message : String(caught),
        });
        setSubmissionPending(false);
        return;
      }
      editorDrafts.register(candidate);
      setSubmissionPending(false);
    };
    void submitAndRegister();
  }, [
    executionUnavailable,
    input,
    instance,
    readTitle,
    readDraftAuthority,
    editorDrafts,
    state,
    submissionAttempt,
    submitAndWait,
    toolCallId,
  ]);

  const definition =
    reviewed?.definition ?? draft?.definition ?? instance.definition.get();
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
    const currentDefinition = structuredClone(instance.definition.get());
    const current = prepareOrExplain(
      pending.prepared.request,
      currentDefinition,
      readTitle(),
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
    const controller = new AbortController();
    editorDrafts.update(toolCallId, {
      prepared: current.prepared,
      definition: currentDefinition,
      run: { phase: "running", controller, progress: null },
    });
    try {
      const result = await experimentHost.runExperiment(
        current.prepared.request,
        {
          signal: controller.signal,
          onProgress: (progress) =>
            editorDrafts.update(toolCallId, {
              run: { phase: "running", controller, progress },
            }),
        },
      );
      editorDrafts.update(toolCallId, { run: { phase: "finished", result } });
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
      : preparationFailure
        ? preparationFailure.kind === "prepare"
          ? "Draft could not be prepared"
          : "Draft could not be submitted"
        : "Not retained in this editor"
    : draft.invalid !== null
      ? "Could not be prepared"
      : draft.dismissed
        ? "Dismissed"
        : draft.run.phase === "running"
          ? "Running"
          : draft.run.phase === "finished"
            ? `Run ${draft.run.result.status}`
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
  const experimentId =
    run?.phase === "finished"
      ? run.result.experimentId
      : run?.phase === "running"
        ? run.progress?.experimentId
        : undefined;
  const canViewExperiment =
    experimentId &&
    experiments.some((experiment) => experiment.id === experimentId);

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
              : preparationFailure
                ? preparationFailure.kind === "prepare"
                  ? `The experiment proposal could not be prepared: ${preparationFailure.message}`
                  : `The prepared proposal could not be submitted: ${preparationFailure.message}`
                : "This draft was prepared before this editor was loaded. Ask Brunch to draft it again to run it.")}
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
          No restrictions were stated. The request carries no constraints, so
          none are enforced.
        </p>
      ) : (
        <ul className={listStyle}>
          {input.unsupported.map((condition) => (
            <li key={condition.condition}>
              {condition.condition} — {condition.reason}
              {condition.reportedByMetricId ? (
                <span className={tagStyle}>
                  reported by {condition.reportedByMetricId}, not enforced
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {blocksRun ? (
        <p className={noticeStyle} role="alert">
          Run is blocked by an unsupported restriction. Ask Brunch to revise the
          proposal; a reporting-only exploration needs your explicit acceptance.
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
            before running, or ask Brunch to draft it again.
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
      {run && run.phase !== "idle" && draft.prepared ? (
        <ExperimentExecutionCard
          request={draft.prepared.request}
          active={run.phase === "running"}
          progress={
            run.phase === "running" ? (run.progress ?? undefined) : undefined
          }
          result={run.phase === "finished" ? run.result : undefined}
          error={run.phase === "failed" ? run.message : undefined}
          onCancel={
            run.phase === "running" ? () => run.controller.abort() : undefined
          }
          onViewExperiment={
            canViewExperiment
              ? () => {
                  navigate(
                    openPetrinautSimulationResource({
                      type: "experiment",
                      id: experimentId,
                    }),
                    { cause: "user", action: "simulation-resource" },
                  );
                }
              : undefined
          }
        />
      ) : null}
      {canAct ? (
        <div className={actionsStyle}>
          <button
            className={secondaryButtonStyle}
            onClick={() => editorDrafts.update(toolCallId, { dismissed: true })}
            type="button"
          >
            Dismiss
          </button>
          {canRun ? (
            reviewed && !reviewAccepted ? (
              <button
                className={primaryButtonStyle}
                disabled={blocksRun}
                onClick={() => setReviewAccepted(true)}
                type="button"
              >
                Accept current model
              </button>
            ) : (
              <button
                className={primaryButtonStyle}
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
              </button>
            )
          ) : null}
        </div>
      ) : null}
      {!draft && preparationFailure && state === "awaiting" ? (
        <div className={actionsStyle}>
          <button
            className={primaryButtonStyle}
            onClick={() => {
              preparedOnceRef.current = false;
              setPreparationFailure(null);
              setSubmissionPending(true);
              setSubmissionAttempt((attempt) => attempt + 1);
            }}
            type="button"
          >
            Retry preparation
          </button>
        </div>
      ) : null}
    </section>
  );
};

/**
 * The website-owned card for a Brunch-drafted experiment. It prepares the
 * proposal against the live model, tells Brunch it is drafted (not run), and
 * lets the person Run or Dismiss it. Run reuses the stock experiment host, so
 * records, the active indicator and the Experiments view behave as shipped.
 * Only View experiment navigates; drafts stay in this editor's memory.
 */
export const createBrunchDraftExperimentInteractiveTool = ({
  readTitle,
  readDraftAuthority,
}: {
  readTitle: () => string;
  readDraftAuthority: (toolCallId: string) => Promise<string>;
}) =>
  definePetrinautAiInteractiveTool<
    DraftPetrinautExperimentInput,
    DraftPetrinautExperimentOutput
  >({
    toolName: draftPetrinautExperimentToolName,
    inputSchema: draftPetrinautExperimentInputSchema,
    outputSchema: draftPetrinautExperimentOutputSchema,
    component: (props) => (
      <BrunchDraftExperimentWidget
        {...props}
        readTitle={readTitle}
        readDraftAuthority={readDraftAuthority}
      />
    ),
  });
