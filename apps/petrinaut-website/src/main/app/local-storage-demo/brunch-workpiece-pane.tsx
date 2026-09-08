import { canonicalContent } from "@hashintel/brunch-agent-plugin-sdcpn";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A view of actual model-facing results, never a second current-state authority. */
export const BrunchWorkpiecePane = ({
  messages,
  binding,
  liveHash,
}: {
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
  let read: { toolCallId: string; output: Record<string, unknown> } | undefined;
  let why: { toolCallId: string; output: Record<string, unknown> } | undefined;
  let stateChangedSinceRead = false;
  for (const message of messages) {
    if (message.role !== "assistant" || message.purpose !== "assistant")
      continue;
    for (const part of message.parts) {
      if (
        !record(part) ||
        part.type !== "dynamic-tool" ||
        part.state !== "output-available"
      )
        continue;
      if (part.toolName === "update_workpiece") stateChangedSinceRead = true;
      if (
        (part.toolName === "brunch_workpiece" ||
          part.toolName === "brunch_why") &&
        typeof part.toolCallId === "string" &&
        record(part.output)
      ) {
        if (
          part.toolName === "brunch_why" &&
          canonicalContent(part.output.binding) !== canonicalContent(binding)
        )
          continue;
        read = { toolCallId: part.toolCallId, output: part.output };
        stateChangedSinceRead = false;
        if (part.toolName === "brunch_why") why = read;
      }
    }
  }
  const workpiece =
    read && record(read.output.currentWorkpiece)
      ? read.output.currentWorkpiece
      : undefined;
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
        zIndex: 20,
        fontSize: 12,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h2>Current workpiece · recorded why</h2>
      <p>
        TEST-authored prepared tracer. Not expert testimony or utility
        acceptance.
      </p>
      {!read ? (
        <p>
          Current state has not been queried. Ask Brunch to read the workpiece
          or explain an arc.
        </p>
      ) : (
        <>
          <p>
            State reported by {read.toolCallId}. Reopen and ask again to query
            the current authority; this pane does not reconstruct state from
            history.
          </p>
          {stateChangedSinceRead && (
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
