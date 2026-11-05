import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  projectLedger,
  type LedgerHistoryMessage,
  type LedgerTrace,
} from "@hashintel/brunch-agent";
import { Button, TextArea, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { selectedLedgerAddresses } from "./brunch-ledger-comment-anchor";
import { shortQuote } from "./brunch-ledger-comment-messages";
import { BrunchLedgerDocument } from "./brunch-ledger-document";
import { foldBrunchLedgerHistory } from "./brunch-ledger-history";
import {
  traceCanvasSelection,
  tracedAddresses,
} from "./brunch-ledger-selection";

import type {
  PendingComments,
  PendingCommentsState,
} from "./brunch-ledger-comments";
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

/** Text selected in the Ledger, and where to offer a comment on it. */
type CommentTarget = {
  records: string[];
  quote: string;
  top: number;
  left: number;
};

const formWidth = 280;

const floatingStyle = css({
  position: "absolute",
  zIndex: "[10]",
  boxShadow: "md",
  borderRadius: "md",
});

const formStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "2",
  backgroundColor: "neutral.s00",
  borderWidth: "thin",
  borderColor: "neutral.s40",
  fontSize: "sm",
  "& blockquote": { color: "neutral.s90", fontStyle: "italic" },
});

const noPending: PendingCommentsState = { comments: [], sending: "idle" };
const subscribeToNothing = () => () => {};
const readNoPending = () => noPending;

const CommentForm = ({
  target,
  onAdd,
  onCancel,
}: {
  target: CommentTarget;
  onAdd: (text: string) => void;
  onCancel: () => void;
}) => {
  const [text, setText] = useState("");
  const add = () => {
    if (text.trim() !== "") onAdd(text.trim());
  };
  return (
    <div
      role="dialog"
      aria-label="Comment on the Ledger"
      className={`${floatingStyle} ${formStyle}`}
      style={{ top: target.top, left: target.left, width: formWidth }}
    >
      {target.quote !== "" && (
        <blockquote>“{shortQuote(target.quote)}”</blockquote>
      )}
      <TextArea
        aria-label="Comment"
        autoFocus
        autoResize
        rows={2}
        size="sm"
        placeholder="What should Brunch change or ask about?"
        value={text}
        onChange={setText}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) add();
        }}
      />
      <div
        className={css({ display: "flex", gap: "1", justifyContent: "end" })}
      >
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" disabled={text.trim() === ""} onClick={add}>
          Add comment
        </Button>
      </div>
    </div>
  );
};

/** The Ledger records a selection in `root` touches, and where to offer a comment. */
const commentTargetOf = (
  root: HTMLElement,
  pane: HTMLElement,
): CommentTarget | undefined => {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0)
    return undefined;
  const range = selection.getRangeAt(0);
  const records = selectedLedgerAddresses(range, root);
  if (records.length === 0) return undefined;
  const bounds = range.getBoundingClientRect();
  const frame = pane.getBoundingClientRect();
  return {
    records,
    quote: selection.toString().trim(),
    top: bounds.bottom - frame.top + 4,
    left: Math.max(
      0,
      Math.min(bounds.left - frame.left, frame.width - formWidth),
    ),
  };
};

/**
 * The Ledger compiled from conversation history, read as a document. With a
 * canvas selection, it shows why the selection is modelled as it is and marks
 * the records behind it. With `comments`, the user can select text and comment
 * on the records it touches.
 */
export const BrunchLedgerPane = ({
  messages,
  selection = [],
  onSelectNetElements,
  comments,
}: {
  messages: readonly LedgerHistoryMessage[];
  /** The editor's selection, when the pane sits beside a canvas. */
  selection?: readonly SelectionItem[];
  onSelectNetElements?: (items: SelectionItem[]) => void;
  /** The editor's pending comments, which the composer sends to Brunch. */
  comments?: PendingComments;
}) => {
  const id = useId();
  const paneRef = useRef<HTMLElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [showReflections, setShowReflections] = useState(false);
  const [target, setTarget] = useState<CommentTarget>();
  const [composing, setComposing] = useState<CommentTarget>();
  const pending = useSyncExternalStore(
    comments?.subscribe ?? subscribeToNothing,
    comments?.get ?? readNoPending,
  );
  const { ledger } = foldBrunchLedgerHistory(messages);
  const trace = ledger && traceCanvasSelection(ledger, selection);
  const projection = ledger && projectLedger(ledger);

  useEffect(() => {
    if (!comments) return;
    const onSelectionChange = () => {
      const root = documentRef.current;
      const pane = paneRef.current;
      setTarget(root && pane ? commentTargetOf(root, pane) : undefined);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, [comments]);

  const addComment = (text: string) => {
    if (!comments || !composing) return;
    comments.add({
      records: composing.records,
      ...(composing.quote !== "" ? { quote: composing.quote } : {}),
      text,
    });
    setComposing(undefined);
    document.getSelection()?.removeAllRanges();
  };

  return (
    <section
      ref={paneRef}
      aria-label="Ledger"
      className={css({
        position: "relative",
        minWidth: "0",
        userSelect: "text",
        color: "neutral.s110",
        paddingX: "2",
        paddingBottom: "3",
      })}
    >
      {projection === undefined ? (
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
          <div ref={documentRef}>
            <BrunchLedgerDocument
              projection={projection}
              options={{
                traced: tracedAddresses(trace),
                showReflections,
                ...(onSelectNetElements ? { onSelectNetElements } : {}),
                comments: {
                  pending: pending.comments,
                  open: projection.openComments,
                  editable:
                    comments !== undefined &&
                    pending.sending !== "pending" &&
                    pending.sending !== "uncertain",
                  onEdit: (commentId, text) => comments?.edit(commentId, text),
                  onRemove: (commentId) => comments?.remove(commentId),
                },
              }}
            />
          </div>
        </>
      )}
      {target && !composing && (
        <div
          className={floatingStyle}
          style={{ top: target.top, left: target.left }}
        >
          <Button
            size="xs"
            // Keeps the selection, so the click lands before it collapses.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setComposing(target)}
          >
            Comment
          </Button>
        </div>
      )}
      {composing && (
        <CommentForm
          target={composing}
          onAdd={addComment}
          onCancel={() => setComposing(undefined)}
        />
      )}
    </section>
  );
};
