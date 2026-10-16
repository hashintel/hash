import { useId, useState } from "react";

import {
  projectLedger,
  type LedgerHistoryMessage,
  type LedgerTrace,
} from "@hashintel/brunch-agent";
import { Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { BrunchLedgerDocument } from "./brunch-ledger-document";
import { foldBrunchLedgerHistory } from "./brunch-ledger-history";
import {
  traceCanvasSelection,
  tracedAddresses,
} from "./brunch-ledger-selection";

import type { SelectionItem } from "@hashintel/petrinaut-core";

const noticeStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  marginBottom: "3",
});

const basisStyle = css({
  fontSize: "sm",
  lineHeight: "[1.55]",
  borderWidth: "thin",
  borderColor: "blue.s50",
  backgroundColor: "blue.s05",
  borderRadius: "md",
  padding: "3",
  marginBottom: "4",
  "& h2": { fontWeight: "semibold", marginBottom: "2" },
  "& h3": { fontWeight: "medium", marginTop: "2" },
  "& ul": { listStyleType: "disc", paddingLeft: "5" },
  "& blockquote": { color: "neutral.s100", fontStyle: "italic" },
});

/** Why the selected net elements are modelled as they are, from the Ledger. */
const SelectionBasis = ({ trace }: { trace: LedgerTrace }) => {
  if (trace.reflections.length === 0)
    return (
      <aside className={basisStyle} aria-label="Basis of the selection">
        <p>Brunch recorded no reasoning for the selected net elements.</p>
      </aside>
    );
  return (
    <aside className={basisStyle} aria-label="Basis of the selection">
      <h2>Why the selection is modelled this way</h2>
      <ul>
        {trace.reflections.map((reflection) => (
          <li key={reflection.address}>{reflection.text}</li>
        ))}
      </ul>
      {trace.claims.length > 0 && (
        <>
          <h3>Resting on</h3>
          <ul>
            {trace.claims.map((claim) => (
              <li key={claim.address}>
                {claim.text}
                {trace.superseded[claim.address] !== undefined &&
                  " (since replaced)"}
              </li>
            ))}
          </ul>
        </>
      )}
      {trace.turns.length > 0 && (
        <>
          <h3>From the conversation</h3>
          {trace.turns.map((turn) => (
            <blockquote key={turn.id}>“{turn.excerpt}”</blockquote>
          ))}
        </>
      )}
    </aside>
  );
};

/**
 * The Ledger compiled from conversation history, read as a document. With a
 * canvas selection, it shows why the selection is modelled as it is and marks
 * the records behind it.
 */
export const BrunchLedgerPane = ({
  messages,
  selection = [],
  onSelectNetElements,
}: {
  messages: readonly LedgerHistoryMessage[];
  /** The editor's selection, when the pane sits beside a canvas. */
  selection?: readonly SelectionItem[];
  onSelectNetElements?: (items: SelectionItem[]) => void;
}) => {
  const id = useId();
  const [showReflections, setShowReflections] = useState(false);
  const { ledger } = foldBrunchLedgerHistory(messages);
  const trace = ledger && traceCanvasSelection(ledger, selection);
  return (
    <section
      aria-label="Ledger"
      className={css({
        minWidth: "0",
        userSelect: "text",
        color: "neutral.s110",
        paddingX: "2",
        paddingBottom: "3",
      })}
    >
      {ledger === undefined ? (
        <p className={noticeStyle}>Nothing is recorded in the Ledger yet.</p>
      ) : (
        <>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "2",
              fontSize: "xs",
              color: "neutral.s90",
              marginBottom: "3",
            })}
          >
            <Toggle
              aria-labelledby={`${id}-reflections`}
              size="sm"
              value={showReflections}
              onChange={setShowReflections}
            />
            <span id={`${id}-reflections`}>Show Brunch’s reflections</span>
          </div>
          {trace && <SelectionBasis trace={trace} />}
          <BrunchLedgerDocument
            projection={projectLedger(ledger)}
            options={{
              traced: tracedAddresses(trace),
              showReflections,
              ...(onSelectNetElements ? { onSelectNetElements } : {}),
            }}
          />
        </>
      )}
    </section>
  );
};
