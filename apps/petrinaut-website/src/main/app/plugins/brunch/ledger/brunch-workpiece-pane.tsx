import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { css } from "@hashintel/ds-helpers/css";

import {
  foldBrunchWorkpieceHistory,
  type BrunchWorkpieceHistoryMessage,
} from "./brunch-workpiece-history";

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

/** A readable view of the saved Ledger, never a second current-state authority. */
export const BrunchWorkpiecePane = ({
  messages,
  binding,
}: {
  messages: readonly BrunchWorkpieceHistoryMessage[];
  binding: {
    conversationId: string;
    documentId: string;
    incarnationId: string;
  };
}) => {
  const { report, stateChangedSinceReport, whyPredatesSettlement } =
    foldBrunchWorkpieceHistory(messages, binding);
  const workpiece = report?.workpiece;
  return (
    <section
      aria-label="Brunch Ledger"
      className={css({
        minWidth: "0",
        userSelect: "text",
        color: "neutral.s110",
        paddingX: "2",
        paddingBottom: "3",
      })}
    >
      {stateChangedSinceReport && (
        <p role="status" className={noticeStyle}>
          A newer Ledger revision exists. Ask Brunch to refresh this view before
          relying on it.
        </p>
      )}
      {whyPredatesSettlement && (
        <p role="status" className={noticeStyle}>
          The recorded explanation predates a newer Ledger revision. Ask why
          again to assess the latest account.
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
    </section>
  );
};
