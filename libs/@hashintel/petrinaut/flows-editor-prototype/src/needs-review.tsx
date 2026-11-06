/**
 * Needs review in a run (6 Nov sync, B11/C12, transcript L579–L619), as takes on where a request opens. Read from
 * `?needsreview=` only, never remembered; with none the run view looks as it does today.
 *
 * Every take shares: a corner ping on each step that waits for someone (the needs-review glyph at the card's top
 * right, one soft ring every 6 s); a "Needs review" list in the run log, with its count; a form on click (the
 * question, a radio group and a comment, Submit); and "Show answered", which adds the answered requests, read-only
 * with what was said.
 *
 * - `panel`: the form opens in the right panel, in place of the run log; selecting a waiting step opens its form too.
 * - `popout`: the form opens in a small pop-out beside the list row, or beside the step when the step is selected.
 * - `inbox`: each row links to the HASH Inbox (`/inbox`), which lists this flow's requests and answers them there.
 * - `link`: `panel`, with "Open in inbox" in the form's header.
 *
 * MOCK: the requests. Run 17 of the Monthly supplier review waits on Quality sign-off (`?at=200&pin`); the loop's
 * two open requests and the two answered ones are invented for the demo.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  Button,
  Icon,
  type IconName,
  RadioGroup,
  TextArea,
  Toggle,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { getCatalogEntry } from "./catalog";
import { findStep } from "./document";
import { useEditor } from "./editor-context";
import { useRunView } from "./history-view";
import { HashShell } from "./hash-shell";
import { navigate } from "./router";
import { outcomeOf, type RunRecord } from "./run-history";
import { RunGlyph } from "./run-glyph";
import { statusColor } from "./status-colors";

export type NeedsReviewTake = "panel" | "popout" | "inbox" | "link";

export const needsReviewTake: NeedsReviewTake | null = (() => {
  const value = new URLSearchParams(globalThis.location.search).get(
    "needsreview",
  );
  return value === "panel" ||
    value === "popout" ||
    value === "inbox" ||
    value === "link"
    ? value
    : null;
})();

/** Whether the form opens in the right panel. */
const inPanel = needsReviewTake === "panel" || needsReviewTake === "link";

/* ----------------------------------------------------------------------------------------------------------------
 * MOCK requests
 * ------------------------------------------------------------------------------------------------------------- */

type Answer = { choice: string; text: string; by: string; at: string };

type ReviewRequest = {
  id: string;
  stepId: string;
  /** The step's name, then the item it waits on: "Fetch certificate › Pinecrest Minerals". */
  path: string;
  question: string;
  /** What the step knows, under the question. */
  detail?: string;
  options: { value: string; label: string }[];
  textLabel: string;
  asked: string;
  answer?: Answer;
};

const flowName = "Monthly supplier review";
const flowId = "monthly-supplier-review";

const requests: ReviewRequest[] = [
  {
    id: "sign-off",
    stepId: "qualitySignOff",
    path: "Quality sign-off",
    question: "Sign off the October supplier review?",
    detail: "19 of 20 suppliers reviewed. Pinecrest Minerals failed.",
    options: [
      { value: "approve", label: "Approve" },
      { value: "reject", label: "Reject" },
      { value: "more", label: "Need more info" },
    ],
    textLabel: "Comment",
    asked: "10:43",
  },
  {
    id: "pinecrest",
    stepId: "fetchCertificate",
    path: "Fetch certificate › Pinecrest Minerals",
    question: "The certificate link returns 404. What should the flow do?",
    detail: "pinecrest.example/certs/2026-10.pdf · 3 tries",
    options: [
      { value: "skip", label: "Skip Pinecrest Minerals" },
      { value: "link", label: "Try another link" },
      { value: "stop", label: "Stop the run" },
    ],
    textLabel: "Link or note",
    asked: "10:43",
  },
  {
    id: "kestrel",
    stepId: "readCertificateLink",
    path: "Read certificate link › Kestrel Alloys",
    question:
      "Kestrel Alloys' page lists two certificates, 2025 and 2026. Which one should I read?",
    options: [
      { value: "2026", label: "2026 certificate" },
      { value: "2025", label: "2025 certificate" },
      { value: "neither", label: "Neither" },
    ],
    textLabel: "Anything else it should know",
    asked: "10:43",
  },
  {
    id: "marlow",
    stepId: "readEmail",
    path: "Read contact email › Marlow Resins",
    question: "Two contact emails found. Which is the quality contact?",
    options: [
      { value: "quality", label: "quality@marlow.example" },
      { value: "sales", label: "sales@marlow.example" },
    ],
    textLabel: "Comment",
    asked: "10:42",
    answer: {
      choice: "quality",
      text: "Use the quality address when there are two.",
      by: "Dora",
      at: "10:42",
    },
  },
  {
    id: "ostara",
    stepId: "readName",
    path: "Read supplier name › Ostara Fibres",
    question: "The record has two trading names. Which goes on the review?",
    options: [
      { value: "ltd", label: "Ostara Fibres Ltd" },
      { value: "short", label: "Ostara" },
    ],
    textLabel: "Comment",
    asked: "10:42",
    answer: { choice: "ltd", text: "", by: "Dora", at: "10:42" },
  },
];

/* ----------------------------------------------------------------------------------------------------------------
 * State: which request is open, where its pop-out sits, Show answered, and the answers given in this session.
 * ------------------------------------------------------------------------------------------------------------- */

type Anchor = { top: number; left: number; right: number; bottom: number };

type ReviewState = {
  openId: string | null;
  anchor: (Anchor & { side: "left" | "right" }) | null;
  showAnswered: boolean;
  answers: Record<string, Answer>;
};

let state: ReviewState = {
  openId: new URLSearchParams(globalThis.location.search).get("request"),
  anchor: null,
  showAnswered: new URLSearchParams(globalThis.location.search).has(
    "answered",
  ),
  answers: {},
};

const listeners = new Set<() => void>();

/** `popout`: the step whose pop-out the current selection already opened. */
let placedFor: string | null = null;

const update = (change: Partial<ReviewState>) => {
  state = { ...state, ...change };
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const useReview = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

const answerOf = (request: ReviewRequest, answers: Record<string, Answer>) =>
  request.answer ?? answers[request.id];

const openRequests = (answers: Record<string, Answer>) =>
  requests.filter((request) => !answerOf(request, answers));

const answeredRequests = (answers: Record<string, Answer>) =>
  requests.filter((request) => answerOf(request, answers));

const rectOf = (element: Element): Anchor => {
  const { top, left, right, bottom } = element.getBoundingClientRect();
  return { top, left, right, bottom };
};

const nowClock = () =>
  new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const submit = (request: ReviewRequest, choice: string, text: string) =>
  update({
    openId: null,
    anchor: null,
    answers: {
      ...state.answers,
      [request.id]: { choice, text, by: "You", at: nowClock() },
    },
  });

/** The run that waits: a live run at Quality sign-off. */
const useWaitingRun = (): RunRecord | null => {
  const view = useRunView();
  if (!needsReviewTake || !view?.run) {
    return null;
  }
  return outcomeOf(view.run, view.now) === "needsReview" ? view.run : null;
};

/* ----------------------------------------------------------------------------------------------------------------
 * Shared parts
 * ------------------------------------------------------------------------------------------------------------- */

const mutedStyle = css({ color: "neutral.fg.subtle" });

const labelStyle = css({
  textStyle: "sm",
  lineHeight: "[14px]",
  fontWeight: "medium",
  color: "neutral.fg.heading",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[16px 1fr auto]",
  columnGap: "3",
  alignItems: "start",
  width: "[100%]",
  paddingX: "4",
  paddingY: "[7px]",
  textAlign: "left",
  textStyle: "sm",
  color: "neutral.fg.body",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "&[aria-current=true]": { backgroundColor: "neutral.bg.surface.active" },
});

const lineStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  minWidth: "[0]",
});

const questionLineStyle = css({
  color: "neutral.fg.heading",
  lineHeight: "[18px]",
});

const subLineStyle = css({
  color: "neutral.fg.subtle",
  lineHeight: "[18px]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** One request as a list row: its mark, the question, then where it waits (or what was said) and when. */
const RequestRow = ({
  request,
  answers,
  current,
  external,
  onOpen,
}: {
  request: ReviewRequest;
  answers: Record<string, Answer>;
  current?: boolean;
  /** The row leaves for the Inbox: an arrow on its right. */
  external?: boolean;
  onOpen: (element: HTMLElement) => void;
}) => {
  const answer = answerOf(request, answers);
  const said = answer
    ? request.options.find((option) => option.value === answer.choice)?.label
    : undefined;
  return (
    <button
      type="button"
      className={rowStyle}
      aria-current={current ? "true" : undefined}
      data-review-request={request.id}
      data-control-check="skip"
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span
        className={css({ display: "inline-flex", alignItems: "center" })}
        style={{ height: 18 }}
      >
        <RunGlyph
          state={answer ? "done" : "needsReview"}
          size={12}
          tooltip={false}
        />
      </span>
      <span className={lineStyle}>
        <span className={questionLineStyle}>{request.question}</span>
        <span className={subLineStyle}>
          {answer
            ? `${said ?? answer.choice} · ${answer.by} · ${answer.at}`
            : `${request.path} · ${request.asked}`}
        </span>
      </span>
      {external ? (
        <span
          className={css({ display: "inline-flex", color: "neutral.fg.subtle" })}
          style={{ height: 18, alignItems: "center" }}
        >
          <Icon name="arrowUpRight" size="sm" />
        </span>
      ) : (
        <span />
      )}
    </button>
  );
};

const listHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  paddingX: "4",
  paddingBottom: "1",
  minHeight: "[28px]",
  textStyle: "sm",
  color: "neutral.fg.subtle",
});

const toggleLabelStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  textStyle: "sm",
  color: "neutral.fg.subtle",
});

const ShowAnswered = () => {
  const { showAnswered } = useReview();
  return (
    <span className={toggleLabelStyle} data-show-answered>
      Show answered
      <Toggle
        size="sm"
        value={showAnswered}
        onChange={(value) => update({ showAnswered: value })}
        aria-label="Show answered"
      />
    </span>
  );
};

/** The open requests, then (with Show answered) the answered ones under a quiet line. */
const RequestList = ({
  onOpen,
  currentId,
  external,
}: {
  onOpen: (request: ReviewRequest, element: HTMLElement) => void;
  /** The row whose form is open, when it differs from the store's. */
  currentId?: string;
  external?: boolean;
}) => {
  const { answers, showAnswered, openId: storeId } = useReview();
  const openId = currentId ?? storeId;
  const open = openRequests(answers);
  const answered = answeredRequests(answers);
  return (
    <>
      {open.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          answers={answers}
          current={openId === request.id}
          external={external}
          onOpen={(element) => onOpen(request, element)}
        />
      ))}
      {open.length === 0 ? (
        <div className={css({ paddingX: "4", paddingY: "[7px]", textStyle: "sm" })}>
          <span className={mutedStyle}>Nothing waits for you</span>
        </div>
      ) : null}
      {showAnswered && answered.length > 0 ? (
        <>
          <div
            className={css({
              paddingX: "4",
              paddingTop: "3",
              paddingBottom: "1",
              textStyle: "sm",
              color: "neutral.fg.subtle",
            })}
          >
            Answered · {answered.length}
          </div>
          {answered.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              answers={answers}
              current={openId === request.id}
              external={external}
              onOpen={(element) => onOpen(request, element)}
            />
          ))}
        </>
      ) : null}
    </>
  );
};

const formStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
});

/** The request's form: the question, a radio group and a comment, Submit. Answered: the same, read-only. */
const RequestForm = ({ request }: { request: ReviewRequest }) => {
  const { answers } = useReview();
  const answer = answerOf(request, answers);
  const [choice, setChoice] = useState<string>(answer?.choice ?? "");
  const [text, setText] = useState(answer?.text ?? "");
  return (
    <div className={formStyle} data-review-form={request.id}>
      <div className={css({ display: "flex", flexDirection: "column", gap: "1" })}>
        <span
          className={css({
            textStyle: "sm",
            fontWeight: "medium",
            color: "neutral.fg.heading",
          })}
        >
          {request.question}
        </span>
        {request.detail ? (
          <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
            {request.detail}
          </span>
        ) : null}
      </div>
      <RadioGroup
        size="sm"
        value={answer ? answer.choice : choice}
        disabled={Boolean(answer)}
        onChange={(next) => setChoice(next)}
        items={request.options}
        aria-label={request.question}
      />
      {answer && !answer.text ? null : (
        <div className={css({ display: "flex", flexDirection: "column", gap: "2" })}>
          <span className={labelStyle}>{request.textLabel}</span>
          <TextArea
            size="sm"
            rows={answer ? 1 : 3}
            readonly={Boolean(answer)}
            autoResize={Boolean(answer)}
            placeholder="Optional"
            value={answer ? answer.text : text}
            onChange={(value) => setText(value)}
          />
        </div>
      )}
      {answer ? (
        <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
          Answered by {answer.by} · {answer.at}
        </span>
      ) : (
        <div className={css({ display: "flex", justifyContent: "flex-end" })}>
          <Button
            size="sm"
            variant="solid"
            disabled={!choice}
            data-review-submit
            onClick={() => submit(request, choice, text)}
          >
            Submit
          </Button>
        </div>
      )}
    </div>
  );
};

const useStepIcon = (stepId: string): IconName => {
  const { document } = useEditor();
  const step = findStep(document, stepId)?.step;
  return (
    (step?.kind === "action"
      ? getCatalogEntry(step.actionDefinitionId)?.icon
      : undefined) ?? "user"
  );
};

const inboxPath = (requestId: string | null) => {
  const query = new URLSearchParams(globalThis.location.search);
  query.delete("step");
  query.set("needsreview", "inbox");
  if (requestId) {
    query.set("request", requestId);
  } else {
    query.delete("request");
  }
  return `/inbox?${query.toString()}`;
};

/* ----------------------------------------------------------------------------------------------------------------
 * 1 · The corner ping on each waiting step
 * ------------------------------------------------------------------------------------------------------------- */

const ensurePingKeyframes = () => {
  const { document } = globalThis;
  if (document.getElementById("needs-review-ping")) {
    return;
  }
  const sheet = document.createElement("style");
  sheet.id = "needs-review-ping";
  // One ring in the first 1.2 s of every 6 s, then nothing.
  sheet.textContent =
    "@keyframes needsReviewPing { 0% { transform: scale(1); opacity: 0.55; } 20% { transform: scale(2.2); opacity: 0; } 100% { transform: scale(2.2); opacity: 0; } }";
  document.head.append(sheet);
};

const pingMarkStyle = css({
  position: "absolute",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[12px]",
  height: "[12px]",
  pointerEvents: "none",
  zIndex: "[3]",
});

const pingRingStyle = css({
  position: "absolute",
  inset: "[0]",
  borderRadius: "full",
  borderWidth: "[1.25px]",
  borderStyle: "solid",
  pointerEvents: "none",
  animationName: "[needsReviewPing]",
  animationDuration: "[6s]",
  animationTimingFunction: "ease-out",
  animationIterationCount: "infinite",
  "@media (prefers-reduced-motion: reduce)": { display: "none" },
});

/**
 * The needs-review glyph on the card's top right, where the card marks sit, with its ring. When the card already
 * draws a mark there (a partly failed step), the ping sits just left of it.
 */
const Ping = ({ host }: { host: HTMLElement }) => {
  ensurePingKeyframes();
  const existing = host.querySelector("[data-card-mark], [data-corner-glyph]");
  const sameState = existing?.querySelector("[data-run-glyph=needsReview]");
  const right = existing && !sameState ? 26 : 10;
  return (
    <span
      className={pingMarkStyle}
      style={{ top: 10, right }}
      data-review-ping
    >
      {sameState ? null : (
        <RunGlyph state="needsReview" detail="Waiting for an answer" />
      )}
      <span
        aria-hidden
        className={pingRingStyle}
        style={{ borderColor: statusColor.review }}
      />
    </span>
  );
};

/** Finds each waiting step's card and draws its ping inside it. */
const ReviewPings = () => {
  const run = useWaitingRun();
  const { answers } = useReview();
  const waiting = [
    ...new Set(openRequests(answers).map((request) => request.stepId)),
  ];
  const key = waiting.join(" ");
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  useEffect(() => {
    if (!run) {
      return;
    }
    const ids = key.split(" ").filter(Boolean);
    const find = () => {
      const found = ids
        .map((id) =>
          globalThis.document.querySelector<HTMLElement>(
            `.react-flow__node[data-id="${id}"]`,
          ),
        )
        .filter((element): element is HTMLElement => element !== null);
      setHosts((current) =>
        current.length === found.length &&
        current.every((element, index) => element === found[index])
          ? current
          : found,
      );
    };
    const first = setTimeout(find, 0);
    const timer = setInterval(find, 400);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [run, key]);
  return (
    <>
      {(run ? hosts : []).map((host) =>
        createPortal(<Ping host={host} />, host, host.dataset.id),
      )}
    </>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * 2 · The list in the run log
 * ------------------------------------------------------------------------------------------------------------- */

const listStyle = css({
  paddingY: "3",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

/** "Needs review · 3" above the log, the open requests, and Show answered. */
const ReviewRequests = () => {
  const run = useWaitingRun();
  const { setUi } = useEditor();
  const { answers } = useReview();
  if (!run) {
    return null;
  }
  const open = openRequests(answers);
  return (
    <div className={listStyle} data-review-list>
      <div className={listHeaderStyle}>
        <span>
          Needs review
          {open.length > 0 ? (
            <span className={css({ color: "neutral.fg.heading" })}>
              {" "}
              · {open.length}
            </span>
          ) : null}
        </span>
        <ShowAnswered />
      </div>
      <RequestList
        external={needsReviewTake === "inbox"}
        onOpen={(request, element) => {
          if (needsReviewTake === "inbox") {
            navigate(inboxPath(request.id));
            return;
          }
          if (needsReviewTake === "popout") {
            update({
              openId: request.id,
              anchor: { ...rectOf(element), side: "left" },
            });
            return;
          }
          update({ openId: request.id, anchor: null });
          setUi((ui) => ({
            ...ui,
            selectedId: request.stepId,
            selectedIds: [request.stepId],
          }));
        }}
      />
    </div>
  );
};

/**
 * Puts the list into the run log, under its summary, without touching the log's own file: a host element after the
 * summary, filled through a portal.
 */
const ListInLog = () => {
  const run = useWaitingRun();
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!run) {
      return;
    }
    const place = () => {
      const panel = globalThis.document.querySelector("[data-run-log-panel]");
      const summary = panel?.firstElementChild;
      if (!panel || !summary) {
        setHost(null);
        return;
      }
      let found = panel.querySelector<HTMLElement>(":scope > [data-review-host]");
      if (!found) {
        found = globalThis.document.createElement("div");
        found.dataset.reviewHost = "";
        summary.after(found);
      }
      const next = found;
      setHost((current) => (current === next ? current : next));
    };
    const first = setTimeout(place, 0);
    const timer = setInterval(place, 300);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [run]);
  return run && host ? createPortal(<ReviewRequests />, host) : null;
};

/* ----------------------------------------------------------------------------------------------------------------
 * 3 · Where the form opens: the right panel (`panel`, `link`) or a pop-out (`popout`)
 * ------------------------------------------------------------------------------------------------------------- */

const panelStyle = css({
  position: "relative",
  flexShrink: 0,
  width: "[384px]",
  height: "[100%]",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "8",
  padding: "6",
  backgroundColor: "neutral.bgSolid.min",
  borderLeftWidth: "thin",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.solid",
  zIndex: "[5]",
});

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
});

const tileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[28px]",
  height: "[28px]",
  borderRadius: "md",
  backgroundColor: "neutral.bg.surface.active",
  color: "neutral.fg.muted",
});

const RequestHeader = ({
  request,
  onClose,
  closeIcon,
}: {
  request: ReviewRequest;
  onClose: () => void;
  closeIcon: "arrowLeft" | "close";
}) => {
  const icon = useStepIcon(request.stepId);
  const [step, item] = request.path.split(" › ");
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
      <div className={headerRowStyle}>
        {closeIcon === "arrowLeft" ? (
          <Button
            size="sm"
            variant="ghost"
            tone="neutral"
            iconName="arrowLeft"
            aria-label="Back to the run log"
            tooltip="Back to the run log"
            data-review-back
            onClick={onClose}
          />
        ) : (
          <span className={tileStyle} aria-hidden>
            <Icon name={icon} size="sm" />
          </span>
        )}
        <span
          className={css({
            flex: "1",
            minWidth: "[0]",
            display: "flex",
            flexDirection: "column",
            gap: "0.5",
          })}
        >
          <span className={labelStyle}>{step}</span>
          <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
            {[item, `Run 17 · ${request.asked}`].filter(Boolean).join(" · ")}
          </span>
        </span>
        {needsReviewTake === "link" ? (
          <Button
            size="sm"
            variant="ghost"
            tone="neutral"
            data-review-inbox-link
            onClick={() => navigate(inboxPath(request.id))}
          >
            Open in inbox
          </Button>
        ) : null}
        {closeIcon === "close" ? (
          <Button
            size="sm"
            variant="ghost"
            tone="neutral"
            iconName="close"
            aria-label="Close"
            tooltip="Close"
            data-review-close
            onClick={onClose}
          />
        ) : null}
      </div>
    </div>
  );
};

const popoutStyle = css({
  position: "fixed",
  zIndex: "[60]",
  width: "[360px]",
  display: "flex",
  flexDirection: "column",
  gap: "5",
  padding: "4",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "[10px]",
  boxShadow:
    "[0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)]",
});

const Popout = ({
  request,
  anchor,
  onClose,
}: {
  request: ReviewRequest;
  anchor: NonNullable<ReviewState["anchor"]>;
  onClose: () => void;
}) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    globalThis.addEventListener("keydown", onKey, true);
    return () => globalThis.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const width = 360;
  const viewportHeight = globalThis.innerHeight;
  // Beside the step on its right, or on its left when the right would run under the docked panel.
  const panelEdge = globalThis.innerWidth - 384;
  const left =
    anchor.side === "left"
      ? anchor.left - width - 8
      : anchor.right + 12 + width <= panelEdge - 12
        ? anchor.right + 12
        : anchor.left - width - 12;
  const top = Math.max(12, Math.min(anchor.top - 4, viewportHeight - 420));
  return (
    <div
      className={popoutStyle}
      style={{ left, top }}
      role="dialog"
      aria-label={request.question}
      data-review-popout
    >
      <RequestHeader request={request} onClose={onClose} closeIcon="close" />
      <RequestForm key={request.id} request={request} />
    </div>
  );
};

/**
 * Wraps the run's right panel. `panel` and `link`: an open request (or a selected waiting step) takes the panel.
 * `popout`: the panel stays; the open request floats beside its row or its step.
 */
export const ReviewSide = ({ children }: { children: React.ReactNode }) => {
  const run = useWaitingRun();
  const { ui, setUi } = useEditor();
  const { openId, anchor, answers } = useReview();
  const selected = ui.selectedId;
  const stepRequest = selected
    ? openRequests(answers).find((request) => request.stepId === selected)
    : undefined;
  const stepRequestId = stepRequest?.id;

  // `popout`: selecting a waiting step opens its request beside the step, once per selection.
  useEffect(() => {
    if (needsReviewTake !== "popout" || !run) {
      return;
    }
    if (!selected || !stepRequestId) {
      placedFor = null;
      return;
    }
    if (placedFor === selected) {
      return;
    }
    placedFor = selected;
    // Selecting a step moves the canvas to it; place the pop-out once it has moved.
    const timer = setTimeout(() => {
      const node = globalThis.document.querySelector(
        `.react-flow__node[data-id="${selected}"]`,
      );
      if (node) {
        update({
          openId: stepRequestId,
          anchor: { ...rectOf(node), side: "right" },
        });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [run, selected, stepRequestId]);

  if (!run || !needsReviewTake) {
    return children;
  }
  const marks = (
    <>
      <ReviewPings />
      <ListInLog />
    </>
  );
  if (needsReviewTake === "inbox") {
    return (
      <>
        {children}
        {marks}
      </>
    );
  }
  const close = () => {
    update({ openId: null, anchor: null });
    if (inPanel) {
      setUi((current) => ({ ...current, selectedId: null, selectedIds: [] }));
    }
  };
  const shown =
    requests.find((request) => request.id === openId) ??
    (inPanel ? stepRequest : undefined);
  if (inPanel) {
    return shown ? (
      <aside className={panelStyle} aria-label="Needs review" data-review-panel>
        <RequestHeader request={shown} onClose={close} closeIcon="arrowLeft" />
        <RequestForm key={shown.id} request={shown} />
        {marks}
      </aside>
    ) : (
      <>
        {children}
        {marks}
      </>
    );
  }
  return (
    <>
      {children}
      {marks}
      {shown && anchor ? (
        <Popout request={shown} anchor={anchor} onClose={close} />
      ) : null}
    </>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * 4 · The HASH Inbox (`inbox`): this flow's requests, answered there
 * ------------------------------------------------------------------------------------------------------------- */

export const isReviewInboxPath = () =>
  needsReviewTake !== null && globalThis.location.pathname === "/inbox";

const inboxStyle = css({
  display: "grid",
  gridTemplateColumns: "[400px 1fr]",
  height: "[100%]",
  fontFamily: "body",
  color: "neutral.fg.body",
});

const inboxListStyle = css({
  display: "flex",
  flexDirection: "column",
  borderRightWidth: "thin",
  borderRightStyle: "solid",
  borderRightColor: "neutral.bd.subtle",
  overflowY: "auto",
});

const inboxDetailStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "8",
  padding: "8",
  maxWidth: "[640px]",
  overflowY: "auto",
});

const InboxDetail = ({ request }: { request: ReviewRequest }) => {
  const [step, item] = request.path.split(" › ");
  const query = new URLSearchParams(globalThis.location.search);
  query.delete("request");
  query.set("step", request.stepId);
  return (
    <div className={inboxDetailStyle} data-review-inbox-detail>
      <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
        <div className={headerRowStyle}>
          <span
            className={css({
              flex: "1",
              minWidth: "[0]",
              display: "flex",
              flexDirection: "column",
              gap: "0.5",
            })}
          >
            <span className={labelStyle}>{step}</span>
            <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
              {[flowName, "Run 17", item, request.asked]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            tone="neutral"
            data-review-open-flow
            onClick={() =>
              navigate(`/flows/${flowId}/runs/17?${query.toString()}`)
            }
          >
            Open in flow
          </Button>
        </div>
      </div>
      <RequestForm request={request} />
    </div>
  );
};

export const ReviewInbox = () => {
  const { openId, answers } = useReview();
  const open = openRequests(answers);
  const shown = requests.find((request) => request.id === openId) ?? open[0];
  return (
    <HashShell>
      <div className={inboxStyle} data-review-inbox>
        <div className={inboxListStyle}>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              height: "[56px]",
              paddingX: "4",
              textStyle: "base",
              fontWeight: "medium",
              color: "neutral.fg.heading",
              flexShrink: 0,
            })}
          >
            Inbox
          </div>
          <div className={listHeaderStyle}>
            <span>
              Needs review
              {open.length > 0 ? (
                <span className={css({ color: "neutral.fg.heading" })}>
                  {" "}
                  · {open.length}
                </span>
              ) : null}
            </span>
            <ShowAnswered />
          </div>
          <div
            className={css({
              paddingX: "4",
              paddingTop: "2",
              paddingBottom: "1",
              textStyle: "sm",
              color: "neutral.fg.subtle",
            })}
          >
            {flowName} · Run 17
          </div>
          <RequestList
            currentId={shown?.id}
            onOpen={(request) => {
              update({ openId: request.id, anchor: null });
              globalThis.history.replaceState(
                globalThis.history.state,
                "",
                inboxPath(request.id),
              );
            }}
          />
        </div>
        {shown ? (
          <InboxDetail key={shown.id} request={shown} />
        ) : (
          <div className={inboxDetailStyle}>
            <span className={mutedStyle}>Nothing waits for you</span>
          </div>
        )}
      </div>
    </HashShell>
  );
};
