import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { canonicalContent } from "@hashintel/brunch-agent-plugin-sdcpn";
import { css } from "@hashintel/ds-helpers/css";

const documentStyle = css({
  fontSize: "sm",
  lineHeight: "[1.65]",
  overflowWrap: "anywhere",
  overflowX: "auto",
  "& :is(h1, h2, h3, h4)": {
    fontWeight: "semibold",
    lineHeight: "[1.3]",
    marginTop: "6",
    marginBottom: "3",
  },
  "& h1": { fontSize: "xl", marginTop: "0" },
  "& h2": { fontSize: "lg" },
  "& :is(p, ul, ol, table, pre, blockquote)": { marginBottom: "3" },
  "& :is(ul, ol)": { paddingLeft: "5" },
  "& ul": { listStyleType: "disc" },
  "& ol": { listStyleType: "decimal" },
  "& table": { borderCollapse: "collapse", fontSize: "xs" },
  "& :is(th, td)": {
    padding: "2",
    borderWidth: "thin",
    borderColor: "neutral.s35",
    textAlign: "left",
  },
  "& th": { backgroundColor: "neutral.s20" },
  "& pre": { overflowX: "auto" },
  "& a": { color: "blue.s100", textDecoration: "underline" },
});
const noticeStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  marginBottom: "3",
});

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const workpieceMutationToolNames: ReadonlySet<string> = new Set([
  "mutate_workpiece",
  "update_workpiece",
]);
const workpieceReadToolNames: ReadonlySet<string> = new Set([
  "read_workpiece",
  "brunch_workpiece",
]);
const workpieceQueryToolNames: ReadonlySet<string> = new Set([
  "query_workpiece",
  "brunch_why",
]);

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
        typeof part.toolCallId !== "string" ||
        typeof part.toolName !== "string"
      )
        continue;
      if (workpieceMutationToolNames.has(part.toolName)) {
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
        (workpieceReadToolNames.has(part.toolName) ||
          workpieceQueryToolNames.has(part.toolName)) &&
        record(part.output)
      ) {
        if (
          workpieceQueryToolNames.has(part.toolName) &&
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
        if (workpieceQueryToolNames.has(part.toolName)) {
          why = { toolCallId: part.toolCallId, output: part.output };
          whyPredatesSettlement = false;
        }
      }
    }
  }
  const workpiece = report?.workpiece;
  const mutation =
    workpiece && record(workpiece.mutation) ? workpiece.mutation : undefined;
  const removed =
    mutation && record(mutation.removed) ? mutation.removed : undefined;
  const inserted =
    mutation && record(mutation.inserted) ? mutation.inserted : undefined;
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
      className={css({
        minWidth: "0",
        userSelect: "text",
        color: "neutral.s110",
      })}
    >
      <p className={noticeStyle}>
        {workpiece
          ? `Revision ${String(workpiece.ordinal)} · Saved account`
          : "Your account will appear here as Brunch saves it."}
        {!construction && " Test-authored prepared fixture."}
      </p>
      {mutation &&
        removed &&
        inserted &&
        typeof removed.start === "number" &&
        typeof removed.end === "number" &&
        typeof removed.utf16Length === "number" &&
        typeof inserted.start === "number" &&
        typeof inserted.end === "number" &&
        typeof inserted.utf16Length === "number" && (
          <p role="status" className={noticeStyle}>
            {mutation.baseRevisionId === null
              ? "Created from no prior revision"
              : `Changed from revision ${String(mutation.baseRevisionId)}`}
            {`: removed ${removed.utf16Length} UTF-16 units [${removed.start}, ${removed.end}); inserted ${inserted.utf16Length} [${inserted.start}, ${inserted.end}).`}
          </p>
        )}
      {stateChangedSinceReport && (
        <p role="status" className={noticeStyle}>
          A later settlement exists. Query again before treating this workpiece
          as current.
        </p>
      )}
      {whyPredatesSettlement && (
        <p role="status" className={noticeStyle}>
          This why answer predates a later workpiece settlement. It remains a
          recorded answer; ask why again to assess the newer revision.
        </p>
      )}
      {liveDiffers && (
        <p role="alert" className={noticeStyle}>
          Live document hash differs from this recorded answer. Ask why again
          before current attribution; hash difference alone identifies neither a
          hand edit nor its actor.
        </p>
      )}
      {workpiece && typeof workpiece.markdown === "string" && (
        <article
          className={documentStyle}
          data-testid="brunch-workpiece-document"
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            disallowedElements={["img"]}
          >
            {workpiece.markdown}
          </ReactMarkdown>
        </article>
      )}
      <details
        className={css({
          marginTop: "5",
          fontSize: "xs",
          overflowWrap: "anywhere",
          "& summary": { cursor: "pointer", color: "neutral.s90" },
          "& pre": { maxHeight: "[280px]", overflow: "auto" },
        })}
      >
        <summary>Recorded details</summary>
        <h2>Recorded workpiece and explanation</h2>
        <p>
          {construction
            ? "Conversation-bound construction; no prepared workpiece."
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
            {!liveDiffers && (
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
      </details>
    </section>
  );
};
