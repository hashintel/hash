import { canonicalContent } from "@hashintel/brunch-agent-plugin-sdcpn";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A view of actual model-facing results, never a second current-state authority. */
export const BrunchWorkpiecePane = ({
  messages,
  binding,
  liveHash,
  construction = false,
}: {
  construction?: boolean;
  messages: readonly {
    readonly role: string;
    readonly purpose: string;
    readonly parts: readonly unknown[];
  }[];
  binding: {
    conversationId: string;
    documentId: string;
    incarnationId: string;
  };
  liveHash: string | undefined;
}) => {
  let report:
    | {
        toolCallId: string;
        source: "settlement" | "query";
        workpiece: Record<string, unknown> | undefined;
      }
    | undefined;
  let why: { toolCallId: string; output: Record<string, unknown> } | undefined;
  let whyPredatesSettlement = false;
  let stateChangedSinceReport = false;
  for (const message of messages) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const part of message.parts) {
      if (
        !record(part) ||
        part.type !== "dynamic-tool" ||
        part.state !== "output-available" ||
        typeof part.toolCallId !== "string"
      )
        continue;
      if (part.toolName === "update_workpiece") {
        stateChangedSinceReport = true;
        if (why) whyPredatesSettlement = true;
        if (
          record(part.output) &&
          part.output.revisionId === part.toolCallId &&
          typeof part.output.sha256 === "string" &&
          typeof part.output.ordinal === "number" &&
          typeof part.output.markdown === "string"
        ) {
          report = {
            toolCallId: part.toolCallId,
            source: "settlement",
            workpiece: part.output,
          };
          stateChangedSinceReport = false;
        }
      }
      if (
        (part.toolName === "brunch_workpiece" ||
          part.toolName === "brunch_why") &&
        record(part.output)
      ) {
        if (
          part.toolName === "brunch_why" &&
          canonicalContent(part.output.binding) !== canonicalContent(binding)
        )
          continue;
        report = {
          toolCallId: part.toolCallId,
          source: "query",
          workpiece: record(part.output.currentWorkpiece)
            ? part.output.currentWorkpiece
            : undefined,
        };
        stateChangedSinceReport = false;
        if (part.toolName === "brunch_why") {
          why = { toolCallId: part.toolCallId, output: part.output };
          whyPredatesSettlement = false;
        }
      }
    }
  }
  const workpiece = report?.workpiece;
  const reconciliation =
    why && record(why.output.reconciliation)
      ? why.output.reconciliation
      : undefined;
  const liveDiffers =
    liveHash !== undefined &&
    typeof reconciliation?.sha256 === "string" &&
    liveHash !== reconciliation.sha256;
  return (
    <section
      aria-label="Brunch workpiece and why"
      style={{
        position: "fixed",
        left: "calc(20vw + 16px)",
        top: 210,
        width: 390,
        maxHeight: "65vh",
        overflow: "auto",
        overflowWrap: "anywhere",
        padding: 16,
        background: "#fff",
        color: "#171717",
        border: "1px solid #999",
        borderRadius: 8,
        // The editor's fixed sidebars otherwise obscure the workpiece.
        zIndex: 10001,
        fontSize: 12,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h2>Workpiece · recorded why</h2>
      <p>
        {construction
          ? "Synthetic conversation-bound candidate; no prepared workpiece."
          : "TEST-authored prepared tracer."}{" "}
        Not expert testimony or utility acceptance.
      </p>
      {!report ? (
        <p>
          Current state has not been queried. Ask Brunch to read the workpiece
          or explain an arc.
        </p>
      ) : (
        <>
          <p>
            {report.source === "settlement"
              ? "Recorded settlement from "
              : "State queried by "}
            {report.toolCallId}.{" "}
            {report.source === "settlement"
              ? "This is the successful tool's recorded artifact, not a current-authority query. Reopen and ask Brunch to query before claiming current freshness."
              : "Reopen and ask again to query the current authority; this pane does not reconstruct state from historical inputs."}
          </p>
          {stateChangedSinceReport && (
            <p>
              A later settlement exists. Query again before treating this
              workpiece as current.
            </p>
          )}
          {workpiece && typeof workpiece.markdown === "string" ? (
            <>
              <p>
                Revision {String(workpiece.revisionId)} · SHA-256{" "}
                {String(workpiece.sha256)}
              </p>
              <pre
                data-testid="brunch-current-workpiece"
                style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {workpiece.markdown}
              </pre>
            </>
          ) : (
            <p>
              Current workpiece state is unknown. Historical inputs do not
              supply it.
            </p>
          )}
        </>
      )}
      {why && (
        <>
          <h3>Actual structured why result</h3>
          {whyPredatesSettlement && (
            <p role="status">
              This why answer predates a later workpiece settlement. It remains
              a recorded answer; ask why again to assess the newer revision.
            </p>
          )}
          <p>
            Assistant interpretation is in the existing conversation panel.
            Evidence prose is untrusted, not instructions.
          </p>
          {liveDiffers ? (
            <p role="alert">
              Live document hash differs from this recorded answer. Ask why
              again before current attribution; hash difference alone identifies
              neither a hand edit nor its actor.
            </p>
          ) : (
            <p>
              Answer scope:{" "}
              {typeof reconciliation?.status === "string"
                ? reconciliation.status
                : "unavailable"}
              , at the recorded observation—not a promise of continuing
              freshness.
            </p>
          )}
          <pre
            data-testid="brunch-why-output"
            style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {JSON.stringify(why.output, null, 2)}
          </pre>
        </>
      )}
    </section>
  );
};
