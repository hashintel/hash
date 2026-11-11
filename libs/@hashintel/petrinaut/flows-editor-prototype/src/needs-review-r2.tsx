/**
 * Needs review, round 2 (9 Nov sync L291–L325): every take shows three things at once, the question list, the thing
 * being reviewed and the answer form, plus the icon that opens the same request in the HASH inbox (L294–L301). The
 * list stays where it is while you move between questions (Ciarán, L319). Takes differ in where the three sit:
 *
 * - `?needsreview=r2-1`: the step's right panel, list on top (one line per question), the selected question's step,
 *   context and form below it.
 * - `?needsreview=r2-2`: the list at the top of the left Steps column; the step's right panel holds context and form.
 * - `?needsreview=r2-3`: a wide review sheet over the canvas: list left, the reviewed entity or file in the middle,
 *   the step and form right.
 * - `?needsreview=r2-4`: a tray of questions along the bottom of the canvas; the step's right panel holds context
 *   and form.
 *
 * What the context shows depends on the step (Aakarsh, 9 Nov): Fetch certificate shows the supplier entity and its
 * properties, Read certificate link the two files it found, Quality sign-off the suppliers the loop went through.
 *
 * MOCK: the three open requests and two answered ones on the Monthly supplier review's waiting run (`?at=200&pin`).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Button, Icon, type IconName } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { getCatalogEntry } from "./catalog";
import { findStep } from "./document";
import { useEditor } from "./editor-context";
import { RowTile } from "./menu-rows";
import {
  answerOf,
  type ReviewRequest,
  RequestForm,
  ReviewPings,
  update,
  useReview,
  needsReviewTake,
  useWaitingRun,
} from "./needs-review";
import { RunGlyph } from "./run-glyph";
import { STATUS_MARK_SIZE, statusSlotStyle, useStatusSide } from "./status-side";
import { RunIdText } from "./run-id";
import { type Certificate, Page } from "./run-outputs";
import { tileColor } from "./status-colors";
import {
  HueHeader,
  kindGroupOf,
  PropertyRow,
  Section,
  sectionTitleStyle,
} from "./ui";
import { useEscapeCloses } from "./use-escape-closes";

/* ----------------------------------------------------------------------------------------------------------------
 * MOCK requests, each with what the step shows for it
 * ------------------------------------------------------------------------------------------------------------- */

type ReviewContext =
  | {
      kind: "entity";
      type: string;
      name: string;
      rows: { label: string; value: string; failed?: string }[];
    }
  | { kind: "files"; files: Certificate[] }
  | {
      kind: "entities";
      type: string;
      total: number;
      rows: { name: string; line: string; state: "done" | "failed" }[];
    };

type R2Request = ReviewRequest & { context: ReviewContext };

const certificate = (
  fileName: string,
  validUntil: string,
  approved: string,
  certNo: string,
  sizeKb: number,
): Certificate => ({
  kind: "certificate",
  supplier: "Kestrel Alloys",
  item: 7,
  fileName,
  sizeKb,
  issuer: "Lloyd's Register",
  issuerShort: "LR",
  certNo,
  approved,
  validUntil,
  expiring: validUntil.endsWith("2026"),
  scope: "aluminium and titanium alloys",
  url: `kestrel-alloys.com/quality/${fileName}`,
});

const r2Requests: R2Request[] = [
  {
    id: "pinecrest",
    stepId: "fetchCertificate",
    path: "Fetch certificate › Pinecrest Minerals",
    question: "The certificate link returns 404. What should the flow do?",
    options: [
      { value: "skip", label: "Skip Pinecrest Minerals" },
      { value: "link", label: "Try another link" },
      { value: "stop", label: "Stop the run" },
    ],
    textLabel: "Link or note",
    asked: "10:43",
    context: {
      kind: "entity",
      type: "Supplier",
      name: "Pinecrest Minerals",
      rows: [
        { label: "Name", value: "Pinecrest Minerals" },
        { label: "Contact", value: "Ruth Ames" },
        { label: "Email", value: "quality@pinecrest.example" },
        {
          label: "Certificate link",
          value: "pinecrest.example/certs/2026-10.pdf",
          failed: "404 · 3 tries",
        },
        { label: "Last reviewed", value: "September 2026" },
      ],
    },
  },
  {
    id: "kestrel",
    stepId: "readCertificateLink",
    path: "Read certificate link › Kestrel Alloys",
    question:
      "Kestrel Alloys' page lists two certificates. Which one should the flow read?",
    options: [
      { value: "2026", label: "kestrel-alloys_iso-9001_2026.pdf" },
      { value: "2025", label: "kestrel-alloys_iso-9001_2025.pdf" },
      { value: "neither", label: "Neither" },
    ],
    textLabel: "Comment",
    asked: "10:43",
    context: {
      kind: "files",
      files: [
        certificate(
          "kestrel-alloys_iso-9001_2026.pdf",
          "14 Mar 2029",
          "14 Mar 2026",
          "LR23/51296",
          212,
        ),
        certificate(
          "kestrel-alloys_iso-9001_2025.pdf",
          "2 Feb 2026",
          "2 Feb 2023",
          "LR21/38817",
          198,
        ),
      ],
    },
  },
  {
    id: "sign-off",
    stepId: "qualitySignOff",
    path: "Quality sign-off",
    question: "Sign off the October supplier review?",
    options: [
      { value: "approve", label: "Approve" },
      { value: "reject", label: "Reject" },
      { value: "more", label: "Need more info" },
    ],
    textLabel: "Comment",
    asked: "10:43",
    context: {
      kind: "entities",
      type: "Supplier",
      total: 20,
      rows: [
        {
          name: "Pinecrest Minerals",
          line: "Failed at Fetch certificate",
          state: "failed",
        },
        { name: "Halden Chemicals", line: "Valid to 9 Jun 2028", state: "done" },
        { name: "Marlow Resins", line: "Valid to 21 Nov 2027", state: "done" },
        { name: "Ostara Fibres", line: "Valid to 3 Apr 2029", state: "done" },
      ],
    },
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
    context: {
      kind: "entity",
      type: "Supplier",
      name: "Marlow Resins",
      rows: [
        { label: "Name", value: "Marlow Resins" },
        { label: "Email", value: "quality@marlow.example" },
      ],
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
    context: {
      kind: "entity",
      type: "Supplier",
      name: "Ostara Fibres",
      rows: [{ label: "Name", value: "Ostara Fibres Ltd" }],
    },
  },
];

const take = needsReviewTake;

/* ----------------------------------------------------------------------------------------------------------------
 * Shared parts
 * ------------------------------------------------------------------------------------------------------------- */

const useStepFacts = (stepId: string) => {
  const { document } = useEditor();
  const step = findStep(document, stepId)?.step;
  const entry =
    step?.kind === "action"
      ? getCatalogEntry(step.actionDefinitionId)
      : undefined;
  const icon: IconName = entry?.icon ?? "user";
  return { icon, kind: entry?.title ?? "Ask a person" };
};

const splitPath = (request: ReviewRequest) => {
  const [step, item] = request.path.split(" › ");
  return { step: step ?? request.path, item };
};

const openOf = (answers: Record<string, unknown>) =>
  r2Requests.filter(
    (request) => !request.answer && !(request.id in answers),
  );

/** The request on show: the one picked, else the selected step's, else the first open one. */
const useShown = () => {
  const { ui } = useEditor();
  const { openId, answers } = useReview();
  const open = openOf(answers);
  const picked = r2Requests.find((request) => request.id === openId);
  const forStep = ui.selectedId
    ? open.find((request) => request.stepId === ui.selectedId)
    : undefined;
  return { shown: picked ?? forStep ?? open[0], open, answers };
};

const usePick = () => {
  const { setUi } = useEditor();
  return (request: R2Request) => {
    update({ openId: request.id, anchor: null });
    setUi((ui) => ({
      ...ui,
      selectedId: request.stepId,
      selectedIds: [request.stepId],
    }));
  };
};

const InboxButton = ({ request }: { request: ReviewRequest }) => (
  <Button
    size="sm"
    variant="ghost"
    tone="neutral"
    iconName="externalLink"
    aria-label="Open in HASH inbox"
    tooltip="Open in HASH inbox"
    data-review-inbox-link={request.id}
  />
);

const listCountStyle = css({ color: "neutral.fg.muted" });

const ListTitle = ({ count }: { count: number }) => (
  <span className={sectionTitleStyle}>
    Needs review <span className={listCountStyle}>· {count}</span>
  </span>
);

const rowBase = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  width: "[100%]",
  minWidth: "[0]",
  paddingX: "2",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
  "&[aria-current=true], &[aria-current=true]:hover": { backgroundColor: "neutral.bg.subtle.active" },
});

const lineOne = css({
  display: "block",
  textStyle: "sm",
  lineHeight: "[18px]",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const lineTwo = css({
  display: "block",
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** One question: its step's hue tile, the question over step › item (or step › item alone), then its mark. */
const QuestionRow = ({
  request,
  current,
  oneLine,
  onPick,
}: {
  request: R2Request;
  current: boolean;
  oneLine?: boolean;
  onPick: () => void;
}) => {
  const { icon, kind } = useStepFacts(request.stepId);
  const { step, item } = splitPath(request);
  const { answers } = useReview();
  const answered = Boolean(answerOf(request, answers));
  const side = useStatusSide();
  const sideMark = (
    <span className={statusSlotStyle} data-status-slot={side}>
      <RunGlyph
        state={answered ? "done" : "needsReview"}
        size={STATUS_MARK_SIZE}
        tooltip={false}
      />
    </span>
  );
  return (
    <button
      type="button"
      className={rowBase}
      style={{ height: oneLine ? 32 : 48 }}
      aria-current={current ? "true" : undefined}
      data-review-request={request.id}
      data-control-check="skip"
      onClick={onPick}
    >
      {side === "left" ? sideMark : null}
      <RowTile icon={icon} twoLine={!oneLine} tint={tileColor(icon)} />
      <span className={css({ flex: "1", minWidth: "[0]" })}>
        {oneLine ? (
          <span className={lineOne}>{request.path}</span>
        ) : (
          // The item the question is about over its step: short real names that fit a narrow column.
          <>
            <span className={lineOne}>{item ?? step}</span>
            <span className={lineTwo}>{item ? step : kind}</span>
          </>
        )}
      </span>
      {side === "left" ? null : side === "right" ? (
        sideMark
      ) : (
        <span className={css({ display: "inline-flex", flexShrink: 0 })}>
          <RunGlyph
            state={answered ? "done" : "needsReview"}
            size={12}
            tooltip={false}
          />
        </span>
      )}
    </button>
  );
};

/** The open questions, then a quiet "Answered · 2" that opens the answered ones in place. */
const QuestionList = ({
  oneLine,
  direction = "column",
}: {
  oneLine?: boolean;
  direction?: "column" | "row";
}) => {
  const { shown, open, answers } = useShown();
  const pick = usePick();
  const [showAnswered, setShowAnswered] = useState(false);
  const side = useStatusSide();
  const answered = r2Requests.filter((request) =>
    Boolean(answerOf(request, answers)),
  );
  if (direction === "row") {
    return (
      <div className={css({ display: "flex", gap: "2", minWidth: "[0]" })}>
        {open.map((request) => (
          <div
            key={request.id}
            className={css({
              flex: "1",
              minWidth: "[0]",
              maxWidth: "[300px]",
              borderWidth: "thin",
              borderStyle: "solid",
              borderRadius: "lg",
              backgroundColor: "neutral.bgSolid.min",
            })}
            style={{
              borderColor:
                shown?.id === request.id
                  ? "var(--flows-sel-border)"
                  : "var(--colors-neutral-bd-subtle)",
            }}
          >
            <QuestionRow
              request={request}
              current={false}
              onPick={() => pick(request)}
            />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={css({ display: "flex", flexDirection: "column" })}>
      {open.map((request) => (
        <QuestionRow
          key={request.id}
          request={request}
          current={shown?.id === request.id}
          oneLine={oneLine}
          onPick={() => pick(request)}
        />
      ))}
      {answered.length > 0 ? (
        <button
          type="button"
          className={cx(rowBase, css({ color: "neutral.fg.muted", textStyle: "sm" }))}
          style={{ height: 32 }}
          data-control-check="skip"
          onClick={() => setShowAnswered((value) => !value)}
        >
          {/* Marks on the left: an empty slot keeps the chevron in the tiles' column. */}
          {side === "left" ? <span className={statusSlotStyle} /> : null}
          <span
            className={css({
              display: "inline-flex",
              justifyContent: "center",
              width: "[32px]",
              flexShrink: 0,
            })}
          >
            <Icon name={showAnswered ? "chevronDown" : "chevronRight"} size="sm" />
          </span>
          Answered · {answered.length}
        </button>
      ) : null}
      {showAnswered
        ? answered.map((request) => (
            <QuestionRow
              key={request.id}
              request={request}
              current={shown?.id === request.id}
              oneLine={oneLine}
              onPick={() => pick(request)}
            />
          ))
        : null}
    </div>
  );
};

/** The H4 header of the step the question is about, with the open-in-inbox icon at its right. */
const StepHeader = ({ request }: { request: R2Request }) => {
  const { icon, kind } = useStepFacts(request.stepId);
  const { step } = splitPath(request);
  const group = kindGroupOf(icon);
  return (
    <div className={css({ display: "flex", alignItems: "flex-start", gap: "2" })}>
      <div className={css({ flex: "1", minWidth: "[0]" })}>
        {/* Kind on top, "Group · name" below, as every panel header (k3); what it is about shows in the context. */}
        <HueHeader icon={icon} title={<span>{kind}</span>}>
          <span
            className={css({
              textStyle: "sm",
              color: "neutral.fg.muted.hover",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            })}
          >
            {[group, step].filter(Boolean).join(" · ")}
          </span>
        </HueHeader>
      </div>
      <InboxButton request={request} />
    </div>
  );
};

const failedLineStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  marginTop: "1",
  textStyle: "sm",
  color: "neutral.fg.muted",
});

const valueStyle = css({
  textStyle: "sm",
  color: "neutral.fg.body",
  overflowWrap: "anywhere",
});

const fileNameStyle = css({
  display: "block",
  marginTop: "2",
  textStyle: "sm",
  lineHeight: "[18px]",
  color: "neutral.fg.heading",
  overflowWrap: "anywhere",
});

/** What is being reviewed: the entity and its properties, the files, or the entities the loop went through. */
const ContextView = ({
  request,
  pageWidth,
}: {
  request: R2Request;
  pageWidth: number;
}) => {
  const { context } = request;
  if (context.kind === "entity") {
    return (
      <Section title={`${context.type} · ${context.name}`}>
        {context.rows.map((row) => (
          <PropertyRow key={row.label} label={row.label}>
            <span className={valueStyle}>
              {row.value}
              {row.failed ? (
                <span className={failedLineStyle}>
                  <RunGlyph state="failed" size={12} tooltip={false} />
                  {row.failed}
                </span>
              ) : null}
            </span>
          </PropertyRow>
        ))}
      </Section>
    );
  }
  if (context.kind === "files") {
    return (
      <Section title={`Files · ${context.files.length}`}>
        <div
          className={css({ display: "flex", gap: "4", gridColumn: "1 / -1" })}
        >
          {context.files.map((file) => (
            <div
              key={file.fileName}
              className={css({ minWidth: "[0]" })}
              style={{ width: pageWidth }}
              data-review-file={file.fileName}
            >
              <Page file={file} width={pageWidth} />
              <span className={fileNameStyle}>{file.fileName}</span>
              <span className={lineTwo}>PDF · {file.sizeKb} KB</span>
              <span className={lineTwo}>Valid to {file.validUntil}</span>
            </div>
          ))}
        </div>
      </Section>
    );
  }
  return (
    <Section title={`For each supplier · ${context.total}`}>
      <div
        className={css({
          gridColumn: "1 / -1",
          display: "flex",
          flexDirection: "column",
        })}
      >
        {context.rows.map((row) => (
          <div
            key={row.name}
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "3",
              height: "[40px]",
              borderBottomWidth: "thin",
              borderBottomStyle: "solid",
              borderBottomColor: "neutral.bd.subtle",
            })}
          >
            <RowTile icon="cube" twoLine={false} />
            <span className={css({ flex: "1", minWidth: "[0]" })}>
              <span className={lineOne}>{row.name}</span>
            </span>
            <span className={lineTwo}>{row.line}</span>
            <RunGlyph state={row.state} size={12} tooltip={false} />
          </div>
        ))}
        <span
          className={css({
            paddingTop: "2",
            textStyle: "sm",
            color: "neutral.fg.muted",
          })}
        >
          Showing {context.rows.length} of {context.total} · Show all
        </span>
      </div>
    </Section>
  );
};

/** The form, with when it was asked and the run under it. */
const AnswerForm = ({ request }: { request: R2Request }) => {
  const run = useWaitingRun();
  return (
    <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
      <RequestForm key={request.id} request={request} />
      {run ? (
        <span className={css({ textStyle: "sm", color: "neutral.fg.muted" })}>
          Asked {request.asked} · <RunIdText run={run} prefix />
        </span>
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The right panel, as the run view's other panels
 * ------------------------------------------------------------------------------------------------------------- */

const panelStyle = css({
  position: "relative",
  flexShrink: 0,
  width: "[384px]",
  height: "[100%]",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "neutral.bgSolid.min",
  borderLeftWidth: "thin",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.solid",
  zIndex: "[5]",
});

const panelBodyStyle = css({
  flex: "1",
  minHeight: "[0]",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "8",
  padding: "6",
});

const ReviewPanel = ({
  request,
  withList,
}: {
  request: R2Request;
  withList?: boolean;
}) => {
  const { open } = useShown();
  // No "Answer" label over the question (11 Nov call, outcomes L18).
  const answer = <AnswerForm request={request} />;
  return (
    <aside className={panelStyle} aria-label="Needs review" data-review-panel>
      {withList ? (
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "3",
            paddingX: "4",
            paddingTop: "6",
            paddingBottom: "4",
            borderBottomWidth: "thin",
            borderBottomStyle: "solid",
            borderBottomColor: "neutral.bd.subtle",
          })}
          data-review-list
        >
          <span className={css({ paddingX: "2" })}>
            <ListTitle count={open.length} />
          </span>
          <QuestionList oneLine />
        </div>
      ) : null}
      <div className={panelBodyStyle}>
        <StepHeader request={request} />
        {/* r2-2 pins the question on top, so it shows without scrolling (ledger 11 Nov 14:40). */}
        {take === "r2-2" ? answer : null}
        <ContextView request={request} pageWidth={156} />
        {take === "r2-2" ? null : answer}
      </div>
    </aside>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Hosts: the left Steps column (r2-2) and the canvas (r2-3, r2-4)
 * ------------------------------------------------------------------------------------------------------------- */

/** Finds (or makes) a host element through `place`, re-checking as the run view re-renders. */
const useHost = (place: () => HTMLElement | null) => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => {
      const next = place();
      setHost((current) => (current === next ? current : next));
    };
    const first = setTimeout(find, 0);
    const timer = setInterval(find, 300);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [place]);
  return host;
};

const hostIn = (parent: Element | null | undefined, name: string, first: boolean) => {
  if (!parent) {
    return null;
  }
  let found = parent.querySelector<HTMLElement>(`:scope > [data-review-host="${name}"]`);
  if (!found) {
    found = globalThis.document.createElement("div");
    found.dataset.reviewHost = name;
    if (first && parent.firstElementChild) {
      parent.firstElementChild.after(found);
    } else {
      parent.append(found);
    }
  }
  return found;
};

const canvasBox = () =>
  globalThis.document.querySelector('[aria-label="Canvas tools"]')
    ?.parentElement ?? null;

const placeSteps = () =>
  hostIn(
    globalThis.document.querySelector('aside[aria-label="Steps"]'),
    "steps",
    true,
  );
const placeTray = () => hostIn(canvasBox(), "tray", false);
const placeSheet = () => hostIn(canvasBox(), "sheet", false);

/** r2-2: the list above the Steps tree, under the column's tab. */
const ListInSteps = () => {
  const host = useHost(placeSteps);
  const { open } = useShown();
  return host
    ? createPortal(
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2",
            paddingX: "2",
            paddingTop: "3",
            paddingBottom: "3",
            borderBottomWidth: "thin",
            borderBottomStyle: "solid",
            borderBottomColor: "neutral.bd.subtle",
          })}
          data-review-list
        >
          <span className={css({ paddingX: "2", paddingY: "1" })}>
            <ListTitle count={open.length} />
          </span>
          <QuestionList />
        </div>,
        host,
      )
    : null;
};

/** r2-4: a tray of question cards along the canvas's bottom edge; the canvas tools move up above it. */
const Tray = () => {
  const host = useHost(placeTray);
  const { open } = useShown();
  useEffect(() => {
    const sheet = globalThis.document.createElement("style");
    sheet.textContent =
      '[aria-label="Canvas tools"] { bottom: 122px !important; }';
    globalThis.document.head.append(sheet);
    return () => sheet.remove();
  }, []);
  return host
    ? createPortal(
        <div
          className={css({
            position: "absolute",
            left: "[0]",
            right: "[0]",
            bottom: "[0]",
            zIndex: "[6]",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "2",
            height: "[104px]",
            paddingX: "4",
            backgroundColor: "neutral.bgSolid.min",
            borderTopWidth: "thin",
            borderTopStyle: "solid",
            borderTopColor: "neutral.bd.subtle",
            overflowX: "auto",
          })}
          data-review-list
          data-review-tray
        >
          <span className={css({ paddingX: "1" })}>
            <ListTitle count={open.length} />
          </span>
          <QuestionList direction="row" />
        </div>,
        host,
      )
    : null;
};

const sheetColumn = css({
  display: "flex",
  flexDirection: "column",
  minHeight: "[0]",
  overflowY: "auto",
});

/** r2-3: a wide sheet over the canvas: list, the reviewed thing, the step and its form. */
const Sheet = ({ request, onClose }: { request: R2Request; onClose: () => void }) => {
  const layer = useEscapeCloses<HTMLDivElement>(onClose);
  const host = useHost(placeSheet);
  const { open } = useShown();
  const run = useWaitingRun();
  return host
    ? createPortal(
        <div
          ref={layer}
          role="dialog"
          aria-label="Needs review"
          data-review-sheet
          className={css({
            position: "absolute",
            inset: "[12px]",
            zIndex: "[20]",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "neutral.bgSolid.min",
            borderWidth: "thin",
            borderStyle: "solid",
            borderColor: "neutral.bd.subtle",
            borderRadius: "xl",
            boxShadow: "lg",
            overflow: "hidden",
          })}
        >
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "2",
              height: "[52px]",
              paddingX: "4",
              borderBottomWidth: "thin",
              borderBottomStyle: "solid",
              borderBottomColor: "neutral.bd.subtle",
            })}
          >
            <span className={css({ flex: "1", minWidth: "[0]", paddingX: "2" })}>
              <ListTitle count={open.length} />
              {run ? (
                <span className={cx(sectionTitleStyle, listCountStyle)}>
                  {" "}
                  · <RunIdText run={run} prefix />
                </span>
              ) : null}
            </span>
            <Button
              size="sm"
              variant="ghost"
              tone="neutral"
              iconName="close"
              aria-label="Close"
              tooltip="Close"
              onClick={onClose}
            />
          </div>
          <div
            className={css({
              flex: "1",
              minHeight: "[0]",
              display: "grid",
              gridTemplateColumns: "[300px minmax(0, 1fr) 360px]",
            })}
          >
            <div
              className={cx(
                sheetColumn,
                css({
                  padding: "3",
                  borderRightWidth: "thin",
                  borderRightStyle: "solid",
                  borderRightColor: "neutral.bd.subtle",
                }),
              )}
              data-review-list
            >
              <QuestionList />
            </div>
            <div
              className={cx(
                sheetColumn,
                css({ padding: "6", backgroundColor: "neutral.bgSolid.min" }),
              )}
              data-review-context
            >
              <ContextView request={request} pageWidth={200} />
            </div>
            <div
              className={cx(
                sheetColumn,
                css({
                  gap: "8",
                  padding: "6",
                  borderLeftWidth: "thin",
                  borderLeftStyle: "solid",
                  borderLeftColor: "neutral.bd.subtle",
                }),
              )}
            >
              <StepHeader request={request} />
              <AnswerForm request={request} />
            </div>
          </div>
        </div>,
        host,
      )
    : null;
};

/* ----------------------------------------------------------------------------------------------------------------
 * The take
 * ------------------------------------------------------------------------------------------------------------- */

export const ReviewR2Side = ({ children }: { children: React.ReactNode }) => {
  const { ui, setUi } = useEditor();
  const { shown } = useShown();
  // The first open question's step starts selected, so the canvas marks the step it is about.
  const firstStep = shown?.stepId;
  useEffect(() => {
    if (firstStep && take !== "r2-3") {
      setUi((current) =>
        current.selectedId
          ? current
          : { ...current, selectedId: firstStep, selectedIds: [firstStep] },
      );
    }
  }, [firstStep, setUi]);
  const [sheetOpen, setSheetOpen] = useState(true);
  const run = useWaitingRun();
  // A selected step with nothing to answer shows its own panel.
  const otherStep =
    ui.selectedId !== null &&
    ui.selectedId !== undefined &&
    !r2Requests.some((request) => request.stepId === ui.selectedId);
  if (!run) {
    return children;
  }
  const marks = <ReviewPings />;
  if (take === "r2-3") {
    return (
      <>
        {sheetOpen && shown ? null : children}
        {marks}
        {sheetOpen && shown ? (
          <Sheet request={shown} onClose={() => setSheetOpen(false)} />
        ) : null}
      </>
    );
  }
  const panel =
    shown && !otherStep ? (
      <ReviewPanel request={shown} withList={take === "r2-1"} />
    ) : (
      children
    );
  return (
    <>
      {panel}
      {marks}
      {take === "r2-2" ? <ListInSteps /> : null}
      {take === "r2-4" ? <Tray /> : null}
    </>
  );
};
