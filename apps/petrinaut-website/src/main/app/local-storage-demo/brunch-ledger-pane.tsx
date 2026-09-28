import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { css } from "@hashintel/ds-helpers/css";

import {
  foldBrunchLedgerHistory,
  type BrunchLedgerHistoryMessage,
} from "./brunch-ledger-history";

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

/** The Ledger compiled from conversation history, as the model reads it. */
export const BrunchLedgerPane = ({
  messages,
}: {
  messages: readonly BrunchLedgerHistoryMessage[];
}) => {
  const { markdown } = foldBrunchLedgerHistory(messages);
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
      {markdown === undefined ? (
        <p className={noticeStyle}>Nothing is recorded in the Ledger yet.</p>
      ) : (
        <article className={documentStyle} data-testid="brunch-ledger-document">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml
            disallowedElements={["img"]}
          >
            {markdown}
          </ReactMarkdown>
        </article>
      )}
    </section>
  );
};
