/**
 * `?runlog=b1..b4` (inbox run-log-minimal, round 3, open): run logs for business users, in the right panel when no step
 * is selected. The default (R) is unchanged. Every line comes from what the engine records for a run: step status and
 * times, attempts, the last failure's message and why a step gave up, inputs and outputs, persisted entities
 * (create / update), input requests and who resolved them. Assumed: a plain-language wording per failure, written here.
 *
 * b1 the story: an outcome sentence, who started it, the usual run, then what happened in plain words.
 * b2 the receipts: what changed, grouped (emails sent and to whom, records updated, files saved, not done).
 * b3 needs you first: what to act on, each with its fix, then everything that went fine, folded.
 * b4 the step log, with errors in plain language in place, their fix, and the technical detail behind a toggle.
 * Each ends with "Technical log", the default rows.
 */
import { type ReactNode, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { runIdMono, RunIdText, runLabel } from "./run-id";
import { RunGlyph } from "./run-glyph";
import { STATUS_MARK_SIZE, useStatusSide } from "./status-side";
import {
  factsOf,
  outcomeLabel,
  outcomeOf,
  outcomeState,
  pastRuns,
  type RunRecord,
  type StepState,
  runWhen,
} from "./run-history";
import { type RunOutputs, runOutputs } from "./run-outputs";
import { StatusLine } from "./run-step-status";

export type RunLogTake = "b1" | "b2" | "b3" | "b4";

export const runLogTake = (): RunLogTake | null => {
  // B4 is the default (inbox run-log-minimal, decided); `?runlog=today` keeps the log from before.
  const take = new URLSearchParams(globalThis.location.search).get("runlog");
  return take === "b1" || take === "b2" || take === "b3" || take === "b4"
    ? take
    : take === "today"
      ? null
      : "b4";
};

const headStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "6",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const titleRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "3",
});

const sentenceStyle = css({
  textStyle: "sm",
  color: "neutral.fg.heading",
  lineHeight: "[20px]",
});

const mutedStyle = css({ color: "neutral.fg.subtle" });

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  paddingY: "3",
  "& + &": {
    borderTopWidth: "thin",
    borderTopStyle: "solid",
    borderTopColor: "neutral.bd.subtle",
  },
});

/**
 * `?runlogedge=24`: the summary's sections and lines start on the 24 px edge the run head and every step panel use,
 * not 16 px in.
 */
export const runLogEdge24 =
  new URLSearchParams(globalThis.location.search).get("runlogedge") === "24";

/**
 * `?runsumstatus=line`: the run head adds the one-line Status under the run's ID (mark · word · count), as a step's
 * Status reads.
 */
const runSummaryStatusLine =
  new URLSearchParams(globalThis.location.search).get("runsumstatus") === "line";

const sectionHeadStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingX: "4",
  "[data-run-log-edge] &": { paddingX: "6" },
  paddingBottom: "1",
  textStyle: "sm",
  color: "neutral.fg.subtle",
});

const lineStyle = css({
  display: "grid",
  gridTemplateColumns: "[16px 1fr auto]",
  columnGap: "3",
  alignItems: "start",
  minHeight: "[32px]",
  paddingX: "4",
  "[data-run-log-edge] &": { paddingX: "6" },
  paddingY: "[7px]",
  textStyle: "sm",
  color: "neutral.fg.body",
  "&[data-toggle]": { cursor: "pointer" },
  "&[data-toggle]:hover": { backgroundColor: "neutral.bg.surface.hover" },
  // A line with a second line centres its mark on the 22 px first line (B′, ledger 2 Nov "Menu rows").
  "&:has(> span:nth-child(2) > :nth-child(2)) > span:first-child": {
    height: "[22px]",
  },
});

const markStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "[18px]",
});

const lineTextStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  minWidth: "[0]",
});

const truncateStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const rightStyle = css({
  textStyle: "sm",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
});

const actionsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "2",
  paddingTop: "2",
});

const monoStyle = css({
  fontFamily: "mono",
  textStyle: "xs",
  lineHeight: "[18px]",
  color: "neutral.fg.subtle",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

const linkButtonStyle = css({
  "&[class]": { color: "neutral.fg.subtle", fontWeight: "normal" },
  "&[class]:hover": { color: "neutral.fg.heading" },
});

/* ----------------------------------------------------------------------------------------------------------------
 * What the engine gives, in plain words
 * ------------------------------------------------------------------------------------------------------------- */

const seconds = (duration: string) => {
  const hours = /(\d+)h/.exec(duration)?.[1];
  const minutes = /(\d+)m/.exec(duration)?.[1];
  const secs = /(\d+)s/.exec(duration)?.[1];
  return (
    Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(secs ?? 0)
  );
};

const roughly = (total: number) =>
  total < 90
    ? `${Math.round(total)} s`
    : `${Math.round(total / 60)}m`;

/** The usual run: the median of the scheduled runs that completed. */
const usualRun = () => {
  const completed = pastRuns().filter(
    (past) =>
      past.trigger.kind === "schedule" &&
      past.kind === "past" &&
      past.outcome === "completed" &&
      past.duration,
  );
  const durations = completed
    .map((past) => seconds(past.duration ?? ""))
    .sort((left, right) => left - right);
  const median = durations[Math.floor(durations.length / 2)];
  return median === undefined
    ? null
    : { duration: roughly(median), count: completed.length };
};

/** The fix and wording for a failure; the engine gives the message, the attempt, and why it gave up. */
const possessive = (name: string) =>
  name.endsWith("s") ? `${name}'` : `${name}'s`;

const isBrokenLink = (reason: string) => reason.includes("404");

const plainFailure = (supplier: string, reason: string) =>
  isBrokenLink(reason)
    ? {
        title: `${possessive(supplier)} certificate link is broken`,
        body: "The page it points to wasn't found, so there was no certificate to email.",
        actions: ["Update link", "Retry"],
        technical: [
          "Fetch certificate · attempt 1 of 1",
          "lastFailure: Certificate link returned 404",
          "gaveUpReason: nonRetryable",
        ],
      }
    : {
        title: `${possessive(supplier)} site didn't respond`,
        body: "It was tried 3 times and took over 30 s each time. It may be down for now.",
        actions: ["Retry"],
        technical: [
          "Fetch certificate · attempt 3 of 3",
          "ActivityFailed · retrying · timed out after 30 s (×2)",
          "lastFailure: Certificate link timed out after 30 s",
          "gaveUpReason: attemptsExhausted",
        ],
      };

type Story = {
  glyph: StepState;
  text: string;
  note?: string;
};

const storyOf = (outputs: RunOutputs, run: RunRecord, now: number) => {
  const facts = factsOf(run, now);
  const failed = outputs.failures.length;
  const lines: Story[] = [];
  if (outputs.findFailed) {
    lines.push({
      glyph: "failed",
      text: "Couldn't find the active suppliers",
      note: "Finding them took over 5 min, so nothing else ran",
    });
    return lines;
  }
  lines.push({ glyph: "done", text: `Found ${facts.n} active suppliers` });
  lines.push({
    glyph: failed > 0 ? "doneWithFailures" : "done",
    text: `Fetched ${outputs.certificates.length} certificates`,
    note:
      failed > 0
        ? `${failed} couldn't be fetched, so those suppliers were skipped`
        : undefined,
  });
  lines.push({
    glyph: "done",
    text: `Emailed ${outputs.emails.length} suppliers their review`,
  });
  lines.push({
    glyph: "done",
    text: `Marked ${outputs.updated.length} suppliers reviewed`,
  });
  lines.push(
    facts.signOff === "approved"
      ? { glyph: "done", text: "Head of quality signed off" }
      : facts.signOff === "timedOut"
        ? {
            glyph: "failed",
            text: "Head of quality didn't sign off",
            note: "No answer in 48 h, so the run stopped",
          }
        : facts.signOff === "waiting"
          ? { glyph: "needsReview", text: "Waiting for the Head of quality" }
          : { glyph: "notReached", text: "Head of quality signs off" },
  );
  return lines;
};

const outcomeSentence = (outputs: RunOutputs, run: RunRecord, now: number) => {
  const facts = factsOf(run, now);
  const failed = outputs.failures.length;
  if (outputs.findFailed) {
    return "Nothing was reviewed: the run couldn't find the active suppliers.";
  }
  const reviewed = outputs.updated.length;
  const first = `Reviewed ${reviewed} of ${facts.n} suppliers.`;
  const second =
    failed > 0
      ? ` ${failed} weren't, because their certificates couldn't be fetched.`
      : "";
  const third =
    facts.signOff === "approved"
      ? " Signed off by the Head of quality."
      : facts.signOff === "timedOut"
        ? " The Head of quality didn't sign off in time."
        : "";
  return `${first}${second}${third}`;
};

/* ----------------------------------------------------------------------------------------------------------------
 * Pieces
 * ------------------------------------------------------------------------------------------------------------- */

const Line = ({
  glyph,
  children,
  right,
  open,
  onToggle,
}: {
  glyph?: StepState;
  children: ReactNode;
  right?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) => {
  const side = useStatusSide();
  // Marks on the right: the text, then the count and chevron, then the mark's 16 px slot as the last column. The DOM
  // order stays mark-first so a two-line row still centres its mark on the first line.
  const markRight = side === "right";
  return (
  // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- the chevron button is the keyboard control
  <div
    className={lineStyle}
    data-toggle={onToggle ? true : undefined}
    onClick={onToggle}
    style={markRight ? { gridTemplateColumns: "1fr auto 16px" } : undefined}
  >
    <span
      className={markStyle}
      data-status-slot={side ?? undefined}
      style={markRight ? { gridColumn: 3, gridRow: 1 } : undefined}
    >
      {glyph ? <RunGlyph state={glyph} size={side ? STATUS_MARK_SIZE : 12} /> : null}
    </span>
    <span className={lineTextStyle} style={markRight ? { gridColumn: 1, gridRow: 1 } : undefined}>
      {children}
    </span>
    <span className={rightStyle} style={markRight ? { gridColumn: 2, gridRow: 1 } : undefined}>
      {onToggle ? (
        <span
          className={css({ display: "inline-flex", alignItems: "center", gap: "1" })}
        >
          {right}
          <Icon name={open ? "chevronDown" : "chevronRight"} size="xs" />
        </span>
      ) : (
        right
      )}
    </span>
  </div>
  );
};

/** The run's Status on one line: its mark and word, then how many items failed. */
const RunStatusLine = ({ run, now }: { run: RunRecord; now: number }) => {
  const outcome = outcomeOf(run, now);
  const facts = factsOf(run, now);
  const failed = facts.failures.length;
  return (
    <StatusLine
      state={outcomeState[outcome]}
      word={outcomeLabel[outcome]}
      facts={[failed > 0 && facts.n > 0 ? `${failed} of ${facts.n} failed` : undefined]}
    />
  );
};

const Head = ({
  run,
  now,
  sentence,
  usual,
}: {
  run: RunRecord;
  now: number;
  sentence: string;
  usual: boolean;
}) => {
  const typical = usualRun();
  const started =
    run.trigger.kind === "manual"
      ? `Started by ${run.trigger.by}`
      : "Started by the monthly schedule";
  const duration = run.duration?.replace(/ (m|s|h)\b/g, "$1");
  return (
    <div className={headStyle}>
      <div className={titleRowStyle}>
        <span
          className={css({
            textStyle: "base",
            fontWeight: "medium",
            color: "neutral.fg.heading",
          })}
        >
          {runIdMono() ? <RunIdText run={run} prefix /> : runLabel(run)}
        </span>
        <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
          {[duration, runWhen(run)].filter(Boolean).join(" · ")}
        </span>
      </div>
      {runSummaryStatusLine ? <RunStatusLine run={run} now={now} /> : null}
      <span className={sentenceStyle}>{sentence}</span>
      <span className={css({ textStyle: "sm", color: "neutral.fg.subtle" })}>
        {[
          started,
          usual && typical ? `usually about ${typical.duration}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </div>
  );
};

const TechnicalLog = ({ lines }: { lines: ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={sectionStyle}>
      <div
        className={css({
          paddingX: "2",
          "[data-run-log-edge] &": { paddingX: "4" },
        })}
      >
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          className={linkButtonStyle}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide technical log" : "Technical log"}
        </Button>
      </div>
      {open ? lines : null}
    </div>
  );
};

const FailureBody = ({
  supplier,
  reason,
  details,
}: {
  supplier: string;
  reason: string;
  details: boolean;
}) => {
  const plain = plainFailure(supplier, reason);
  const [showTechnical, setShowTechnical] = useState(false);
  return (
    <>
      <span className={css({ color: "neutral.fg.heading" })}>{plain.title}</span>
      <span className={mutedStyle}>{plain.body}</span>
      <span className={actionsStyle}>
        {plain.actions.map((action) => (
          <Button key={action} size="sm" variant="subtle" tone="neutral">
            {action}
          </Button>
        ))}
        {details ? (
          <Button
            size="sm"
            variant="ghost"
            tone="neutral"
            className={linkButtonStyle}
            onClick={() => setShowTechnical(!showTechnical)}
          >
            {showTechnical ? "Hide details" : "Details"}
          </Button>
        ) : null}
      </span>
      {showTechnical ? (
        <span className={css({ paddingTop: "2" })}>
          <span className={monoStyle}>{plain.technical.join("\n")}</span>
        </span>
      ) : null}
    </>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The takes
 * ------------------------------------------------------------------------------------------------------------- */

const StoryTake = ({ outputs, run, now }: TakeProps) => (
  <div className={sectionStyle}>
    <div className={sectionHeadStyle}>What happened</div>
    {storyOf(outputs, run, now).map((line) => (
      <Line key={line.text} glyph={line.glyph}>
        <span>{line.text}</span>
        {line.note ? <span className={mutedStyle}>{line.note}</span> : null}
      </Line>
    ))}
  </div>
);

const Receipt = ({
  title,
  rows,
  glyph,
}: {
  title: string;
  rows: { key: string; left: string; right?: string }[];
  glyph: StepState;
}) => {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) {
    return null;
  }
  const shown = open ? rows : rows.slice(0, 3);
  return (
    <div className={sectionStyle}>
      <div className={sectionHeadStyle}>
        <span>{title}</span>
        <span className={css({ fontVariantNumeric: "tabular-nums" })}>
          {rows.length}
        </span>
      </div>
      {shown.map((row) => (
        <Line key={row.key} glyph={glyph} right={row.right}>
          <span className={truncateStyle}>{row.left}</span>
        </Line>
      ))}
      {rows.length > 3 ? (
        <div className={css({ paddingX: "4", paddingLeft: "[44px]" })}>
          <Button
            size="sm"
            variant="ghost"
            tone="neutral"
            className={linkButtonStyle}
            onClick={() => setOpen(!open)}
          >
            {open ? "Show fewer" : `${rows.length - 3} more`}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const ReceiptsTake = ({ outputs }: TakeProps) => (
  <>
    <Receipt
      title="Not done"
      glyph="failed"
      rows={outputs.failures.map((failure) => ({
        key: failure.supplier,
        left: failure.supplier,
        right: isBrokenLink(failure.reason) ? "Broken link" : "Site didn't respond",
      }))}
    />
    <Receipt
      title="Emails sent"
      glyph="done"
      rows={outputs.emails.map((email) => ({
        key: email.messageId,
        left: `${email.contact} · ${email.supplier}`,
        right: email.sentAt,
      }))}
    />
    <Receipt
      title="Suppliers updated"
      glyph="done"
      rows={outputs.updated.map((entity) => ({
        key: entity.name,
        left: entity.name,
        right: "Updated",
      }))}
    />
    <Receipt
      title="Certificates saved"
      glyph="done"
      rows={outputs.certificates.map((certificate) => ({
        key: certificate.fileName,
        left: certificate.fileName,
        right: `${certificate.sizeKb} KB`,
      }))}
    />
  </>
);

const NeedsYouTake = ({ outputs, run, now }: TakeProps) => {
  const [restOpen, setRestOpen] = useState(false);
  const facts = factsOf(run, now);
  const waiting = facts.signOff === "waiting";
  const count = outputs.failures.length + (waiting ? 1 : 0);
  const story = storyOf(outputs, run, now).filter(
    (line) => line.glyph === "done",
  );
  return (
    <>
      <div className={sectionStyle}>
        <div className={sectionHeadStyle}>
          {count > 0 ? `Needs you · ${count}` : "Nothing needs you"}
        </div>
        {waiting ? (
          <Line glyph="needsReview">
            <span className={css({ color: "neutral.fg.heading" })}>
              Head of quality to sign off
            </span>
            <span className={mutedStyle}>
              The run waits here until it's approved or rejected.
            </span>
            <span className={actionsStyle}>
              <Button size="sm" variant="subtle" tone="neutral">
                Review
              </Button>
            </span>
          </Line>
        ) : null}
        {outputs.failures.map((failure) => (
          <Line key={failure.supplier} glyph="failed">
            <FailureBody
              supplier={failure.supplier}
              reason={failure.reason}
              details={false}
            />
          </Line>
        ))}
      </div>
      <div className={sectionStyle}>
        <Line
          glyph="done"
          open={restOpen}
          onToggle={() => setRestOpen(!restOpen)}
        >
          <span>Everything else went fine</span>
          <span className={mutedStyle}>
            {`${outputs.updated.length} suppliers reviewed and emailed${facts.signOff === "approved" ? " · signed off" : ""}`}
          </span>
        </Line>
        {restOpen
          ? story.map((line) => (
              <Line key={line.text} glyph={line.glyph}>
                <span>{line.text}</span>
              </Line>
            ))
          : null}
      </div>
    </>
  );
};

const StepsTake = ({ outputs, run, now }: TakeProps) => {
  const [open, setOpen] = useState(true);
  return (
    <div className={sectionStyle}>
      <div className={sectionHeadStyle}>Steps</div>
      {storyOf(outputs, run, now).map((line) =>
        line.glyph === "doneWithFailures" ? (
          <div key={line.text}>
            <Line
              glyph={line.glyph}
              open={open}
              onToggle={() => setOpen(!open)}
              right={`${outputs.failures.length} failed`}
            >
              <span>{line.text}</span>
            </Line>
            {open
              ? outputs.failures.map((failure) => (
                  <div
                    key={failure.supplier}
                    className={css({ paddingLeft: "[28px]" })}
                  >
                    <Line glyph="failed">
                      <FailureBody
                        supplier={failure.supplier}
                        reason={failure.reason}
                        details
                      />
                    </Line>
                  </div>
                ))
              : null}
          </div>
        ) : (
          <Line key={line.text} glyph={line.glyph}>
            <span>{line.text}</span>
            {line.note ? <span className={mutedStyle}>{line.note}</span> : null}
          </Line>
        ),
      )}
    </div>
  );
};

type TakeProps = { outputs: RunOutputs; run: RunRecord; now: number };

/** The panel body for a `?runlog=` take; `technical` is the default log rows. */
export const BusinessRunLog = ({
  take,
  run,
  now,
  technical,
}: {
  take: RunLogTake;
  run: RunRecord;
  now: number;
  technical: ReactNode;
}) => {
  const outputs = runOutputs(run, now);
  const live =
    outcomeOf(run, now) === "running" || outcomeOf(run, now) === "needsReview";
  const props = { outputs, run, now };
  return (
    <>
      <Head
        run={run}
        now={now}
        sentence={
          live
            ? `Running: ${outputs.updated.length} of ${factsOf(run, now).n} suppliers reviewed so far.`
            : outcomeSentence(outputs, run, now)
        }
        usual={!live && take !== "b2"}
      />
      {take === "b1" ? <StoryTake {...props} /> : null}
      {take === "b2" ? <ReceiptsTake {...props} /> : null}
      {take === "b3" ? <NeedsYouTake {...props} /> : null}
      {take === "b4" ? <StepsTake {...props} /> : null}
      <TechnicalLog lines={technical} />
    </>
  );
};
