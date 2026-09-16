import { use, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  canonicalContent,
  type DraftPetrinautExperimentInput,
  draftPetrinautExperimentInputSchema,
  type DraftPetrinautExperimentOutput,
  draftPetrinautExperimentOutputSchema,
  draftPetrinautExperimentToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { css } from "@hashintel/ds-helpers/css";
import {
  ExperimentHostContext,
  OptimizationsContext,
  prepareExperiment,
  usePetrinautInstance,
} from "@hashintel/petrinaut/react";
import {
  definePetrinautAiInteractiveTool,
  type PetrinautAiInteractiveToolWidgetProps,
} from "@hashintel/petrinaut/ui";

import {
  describeBudget,
  describeExperiment,
  metricRoles,
  preparationDiffers,
  summarizeForAgent,
} from "./brunch-draft-experiment-interactive-tool/describe-draft";
import {
  resetSessionDrafts,
  sessionDraftsFor,
} from "./brunch-draft-experiment-interactive-tool/session-drafts";

import type { PreparedExperiment } from "./brunch-draft-experiment-interactive-tool/describe-draft";
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
export const resetBrunchDraftExperimentSession = resetSessionDrafts;

type WidgetProps = PetrinautAiInteractiveToolWidgetProps<
  DraftPetrinautExperimentInput,
  DraftPetrinautExperimentOutput
>;

// Two stable snapshots rather than one fresh object: useSyncExternalStore
// compares snapshots by identity and would re-render without end otherwise.
const useSessionDraft = (
  sessionDrafts: ReturnType<typeof sessionDraftsFor>,
  toolCallId: string,
) => {
  const draft = useSyncExternalStore(sessionDrafts.subscribe, () =>
    sessionDrafts.get().drafts.get(toolCallId),
  );
  const isCurrent = useSyncExternalStore(
    sessionDrafts.subscribe,
    () => sessionDrafts.get().currentToolCallId === toolCallId,
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
  state,
  submit,
  toolCallId,
}: WidgetProps & { readTitle: () => string }) => {
  const instance = usePetrinautInstance();
  const experimentHost = use(ExperimentHostContext);
  const { optimizationUnavailableReason } = use(OptimizationsContext);
  const executionUnavailable =
    input.experiment.execution.mode === "optimize"
      ? optimizationUnavailableReason
      : null;
  const sessionDrafts = sessionDraftsFor(instance.definition);
  const { draft, isCurrent } = useSessionDraft(sessionDrafts, toolCallId);
  const preparedOnceRef = useRef(false);
  const [reviewed, setReviewed] = useState<{
    prepared: PreparedExperiment;
    definition: SDCPN;
  } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // A freshly streamed call prepares once against the live model and reports
  // back so Brunch's turn can continue. Run and Dismiss come after and are
  // not reported through the tool result.
  useEffect(() => {
    if (state !== "awaiting" || preparedOnceRef.current) return;
    preparedOnceRef.current = true;
    const definition = structuredClone(instance.definition.get());
    const outcome = prepareOrExplain(input.experiment, definition, readTitle());
    const registered = sessionDrafts.register({
      toolCallId,
      input,
      definition,
      prepared: outcome.prepared,
      invalid: outcome.error,
      dismissed: false,
      run: { phase: "idle" },
    });
    submit(
      registered.prepared
        ? {
            status: "drafted",
            summary: `${summarizeForAgent(
              registered.prepared.request,
              registered.definition,
              registered.input.unsupported.length,
            )}${
              executionUnavailable === null
                ? ""
                : ` Execution unavailable: ${executionUnavailable}.`
            }`,
            diagnostics: [
              "No constraints or constraint policy are carried; nothing is enforced.",
              ...registered.input.unsupported.map(
                (condition) =>
                  `${condition.blocksRun ? "Run blocked" : "Not carried"}: ${condition.condition}`,
              ),
              ...(executionUnavailable === null
                ? []
                : [`Execution unavailable: ${executionUnavailable}`]),
            ],
          }
        : {
            status: "invalid",
            summary: `The browser could not prepare this experiment against the current model: ${registered.invalid}`,
            diagnostics: [registered.invalid ?? "Preparation failed"],
          },
    );
  }, [
    executionUnavailable,
    input,
    instance,
    readTitle,
    sessionDrafts,
    state,
    submit,
    toolCallId,
  ]);

  const definition =
    reviewed?.definition ?? draft?.definition ?? instance.definition.get();
  const request = draft?.prepared?.request ?? null;
  const blocksRun = input.unsupported.some((condition) => condition.blocksRun);
  const optimizationUnavailable =
    request?.execution.mode === "optimize" ? executionUnavailable : null;

  const onRun = async () => {
    // Read synchronously, not from the render closure: duplicate clicks or a
    // remounted copy of the same card must never start a second experiment.
    const latest = sessionDrafts.get();
    const pending = latest.drafts.get(toolCallId);
    if (
      !pending?.prepared ||
      latest.currentToolCallId !== toolCallId ||
      pending.dismissed ||
      pending.run.phase !== "idle" ||
      pending.input.unsupported.some((condition) => condition.blocksRun) ||
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
      setRunError(null);
      return;
    }
    setRunError(null);
    const controller = new AbortController();
    sessionDrafts.update(toolCallId, {
      run: { phase: "running", controller, progress: null },
    });
    try {
      const result = await experimentHost.runExperiment(
        current.prepared.request,
        {
          signal: controller.signal,
          onProgress: (progress) =>
            sessionDrafts.update(toolCallId, {
              run: { phase: "running", controller, progress },
            }),
        },
      );
      sessionDrafts.update(toolCallId, { run: { phase: "finished", result } });
    } catch (caught) {
      sessionDrafts.update(toolCallId, {
        run: {
          phase: "failed",
          message: caught instanceof Error ? caught.message : String(caught),
        },
      });
    }
  };

  const heading = !draft
    ? "Not retained in this session"
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
    draft.run.phase === "idle";
  const canRun = canAct && optimizationUnavailable === null;

  return (
    <section
      className={containerStyle}
      aria-label="Drafted experiment"
      data-draft-status={heading}
    >
      <p className={statusStyle}>{heading}</p>
      <p className={titleStyle}>{input.experiment.name}</p>
      {request ? (
        <>
          <p className={bodyStyle}>{describeExperiment(request, definition)}</p>
          <p className={bodyStyle}>{describeBudget(request)}</p>
          <p className={sectionLabelStyle}>Metrics</p>
          <ul className={listStyle}>
            {metricRoles(request, definition).map((metric) => (
              <li key={metric.metricId}>
                {metric.name}
                <span className={tagStyle}>
                  {metric.role === "objective"
                    ? "objective"
                    : "reported, not enforced"}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={bodyStyle}>
          {draft?.invalid ??
            "This draft was prepared in an earlier session. Ask Brunch to draft it again to run it."}
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
      {draft?.run.phase === "running" ? (
        <p className={bodyStyle} role="status">
          {draft.run.progress
            ? `${draft.run.progress.phase}: ${draft.run.progress.runsCompleted}/${draft.run.progress.runsTarget} runs${
                draft.run.progress.steps !== undefined
                  ? `, step ${draft.run.progress.step ?? 0}/${draft.run.progress.steps}`
                  : ""
              }`
            : "Starting…"}
        </p>
      ) : null}
      {draft?.run.phase === "finished" ? (
        <p className={bodyStyle} role="status">
          {draft.run.result.message ??
            `${draft.run.result.runsCompleted} runs completed. The result stays in Simulate → Experiments.`}
        </p>
      ) : null}
      {draft?.run.phase === "failed" ? (
        <p className={errorStyle} role="alert">
          {draft.run.message}
        </p>
      ) : null}
      {canAct ? (
        <div className={actionsStyle}>
          <button
            className={secondaryButtonStyle}
            onClick={() =>
              sessionDrafts.update(toolCallId, { dismissed: true })
            }
            type="button"
          >
            Dismiss
          </button>
          {canRun ? (
            <button
              className={primaryButtonStyle}
              disabled={blocksRun}
              onClick={() => void onRun()}
              type="button"
            >
              {reviewed ? "Run against current model" : "Run"}
            </button>
          ) : null}
        </div>
      ) : null}
      {draft?.run.phase === "running" ? (
        <div className={actionsStyle}>
          <button
            className={secondaryButtonStyle}
            onClick={() => {
              if (draft.run.phase === "running") draft.run.controller.abort();
            }}
            type="button"
          >
            Cancel
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
 * It never navigates and keeps nothing beyond this browser session.
 */
export const createBrunchDraftExperimentInteractiveTool = ({
  readTitle,
}: {
  readTitle: () => string;
}) =>
  definePetrinautAiInteractiveTool<
    DraftPetrinautExperimentInput,
    DraftPetrinautExperimentOutput
  >({
    toolName: draftPetrinautExperimentToolName,
    inputSchema: draftPetrinautExperimentInputSchema,
    outputSchema: draftPetrinautExperimentOutputSchema,
    component: (props) => (
      <BrunchDraftExperimentWidget {...props} readTitle={readTitle} />
    ),
  });
