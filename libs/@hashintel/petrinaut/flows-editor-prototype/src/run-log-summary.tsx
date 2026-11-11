/**
 * `?logsum=` (6 Nov sync, A8–A9, B4): the run log for business users and engineers at once. A plain-language summary
 * on top (written by a cheap model, replaced every few actions and once at the end; here worded from the run's facts),
 * the technical log under it. An error is one line by default, its mark and a plain reason; "Show details" opens the
 * one error string the engine keeps, with Copy and Contact support. Unset keeps today's log.
 * - v1: errors in place, inside the log rows.
 * - v2: errors pinned under the summary; the log below marks them only.
 * - v3: summary and errors; the technical log folded behind "Technical log".
 *
 * `?logwide=1` (C9, D15): an Expand control in the panel's header widens the log over the canvas, as Aakarsh
 * floated in the sync; Collapse or Esc brings it back.
 */
import { useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { RunGlyph } from "./run-glyph";
import {
  clockPlus,
  type RunFacts,
  type RunRecord,
  runClock,
  signOffAt,
  suppliers,
} from "./run-history";
import { Toast } from "./ds-parts/toast";

export type LogSummaryTake = "v1" | "v2" | "v3";

export const logSummaryTake = (): LogSummaryTake | null => {
  const value = new URLSearchParams(globalThis.location.search).get("logsum");
  return value === "v1" || value === "v2" || value === "v3" ? value : null;
};

export const logWideTake = () =>
  new URLSearchParams(globalThis.location.search).get("logwide") === "1";

/* ----------------------------------------------------------------------------------------------------------------
 * The summary
 * ------------------------------------------------------------------------------------------------------------- */

const plainReason = (supplier: string, reason: string) =>
  reason === "404"
    ? `${supplier} has no certificate on the portal`
    : `${supplier.endsWith("s") ? `${supplier}'` : `${supplier}'s`} portal didn't respond after 3 tries`;

const listText = (parts: string[]) =>
  parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

const minutesText = (seconds: number) => {
  const rounded = Math.round(seconds);
  return rounded < 60
    ? `${rounded} seconds`
    : `${Math.floor(rounded / 60)} min ${rounded % 60} s`;
};

/** One paragraph on what the run did, from its facts: who started it, what it went through, what failed and why. */
export const summaryParagraph = (
  run: RunRecord,
  facts: RunFacts,
  now: number,
) => {
  const who =
    run.trigger.kind === "manual"
      ? `${run.trigger.by} started this run at ${run.startClock.slice(0, 5)}.`
      : `The monthly schedule started this run at ${run.startClock.slice(0, 5)}.`;
  if (facts.find === "failed") {
    return `${who} It stopped at the first step: finding active suppliers took longer than 5 minutes, so no supplier was checked. Nothing was changed.`;
  }
  if (facts.find === "running") {
    return `${who} It is looking up the active suppliers.`;
  }
  const failed = facts.failures.map((failure) =>
    plainReason(suppliers[failure.item] ?? "a supplier", failure.reason),
  );
  const failedText =
    failed.length === 0
      ? ""
      : ` ${failed.length} couldn't be checked: ${listText(failed)}.`;
  if (run.kind === "live" && !run.stopped) {
    const clock = runClock(run, now);
    const done = Math.min(facts.processed[3], facts.n);
    if (facts.signOff === "waiting") {
      return `${who} It found ${facts.n} active suppliers and checked ${facts.n - facts.failures.length} of them.${failedText} It is waiting for the Head of quality to sign off.`;
    }
    return `${who} It found ${facts.n} active suppliers and has checked ${done} so far, ${minutesText(clock)} in.${failedText} The rest are in progress.`;
  }
  if (facts.abandoned) {
    return `${who} It found ${facts.n} active suppliers. ${facts.processed[3]} were reviewed before it was cancelled; the rest were not checked.`;
  }
  const reviewed = facts.n - facts.failures.length;
  const signOff =
    facts.signOff === "approved"
      ? ` The Head of quality signed off at ${clockPlus(run.startClock, signOffAt(facts.n) + 2).slice(0, 5)}.`
      : facts.signOff === "timedOut"
        ? " The Head of quality didn't sign off within 48 hours, so the run stopped there."
        : "";
  return `${who} It found ${facts.n} active suppliers and fetched each one's certificate. ${reviewed} were reviewed and emailed.${failedText}${signOff}`;
};

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingX: "6",
  paddingY: "4",
  borderBottomWidth: "thin",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const labelRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
  textStyle: "sm",
  color: "neutral.fg.subtle",
});

const quietStyle = css({ textStyle: "xs", color: "neutral.fg.subtle" });

export const LogSummary = ({
  run,
  facts,
  now,
  live,
}: {
  run: RunRecord;
  facts: RunFacts;
  now: number;
  live: boolean;
}) => (
  <section className={sectionStyle} data-log-summary>
    <div className={labelRowStyle}>
      <span>Summary</span>
      <span className={quietStyle}>
        {live
          ? `Updated ${clockPlus(run.startClock, run.kind === "live" ? Math.floor(runClock(run, now) / 30) * 30 : 0).slice(0, 5)}`
          : "Final"}
      </span>
    </div>
    <p
      className={css({
        textStyle: "sm",
        lineHeight: "[22px]",
        color: "neutral.fg.body",
      })}
    >
      {summaryParagraph(run, facts, now)}
    </p>
  </section>
);

/* ----------------------------------------------------------------------------------------------------------------
 * Errors: one line, then the details
 * ------------------------------------------------------------------------------------------------------------- */

export type RunError = {
  id: string;
  /** What failed: "Boreal Metals". */
  where: string;
  /** The step it failed at. */
  step: string;
  /** The one-line reason a business user reads. */
  plain: string;
  /** The one error string the engine keeps. */
  raw: string;
  time: string;
};

const slug = (name: string) => name.toLowerCase().replaceAll(/[^a-z]/g, "");

/** The run's errors, newest last. MOCK error strings, in the shape the engine keeps (one string per failure). */
export const runErrors = (run: RunRecord, facts: RunFacts): RunError[] => {
  if (facts.find === "failed") {
    return [
      {
        id: "find",
        where: "Find active suppliers",
        step: "Find entities",
        plain: "Took longer than 5 minutes",
        raw: "QueryTimeout: query for entities of type Supplier (web @hash) exceeded 300000 ms",
        time: clockPlus(run.startClock, 300),
      },
    ];
  }
  const items = facts.failures.map((failure, index): RunError => {
    const supplier = suppliers[failure.item] ?? "Supplier";
    const url = `https://portal.${slug(supplier)}.com/certificates/iso-9001.pdf`;
    return {
      id: `failed-${supplier}`,
      where: supplier,
      step: "Fetch certificate",
      plain:
        failure.reason === "404"
          ? "No certificate on the portal"
          : "The portal didn't respond",
      raw:
        failure.reason === "404"
          ? `HTTP 404 Not Found: GET ${url} (attempt 3 of 3)`
          : `RequestTimeout: GET ${url} did not respond within 10000 ms (attempt 3 of 3)`,
      time: clockPlus(run.startClock, 79 + index * 4 + 22),
    };
  });
  const signOff: RunError[] =
    facts.signOff === "timedOut"
      ? [
          {
            id: "sign-off",
            where: "Quality sign-off",
            step: "Request input",
            plain: "No answer within 48 hours",
            raw: "InputRequestExpired: request to role Head of quality was not answered within 172800 s",
            time: clockPlus(run.startClock, 48 * 3600),
          },
        ]
      : [];
  return [...items, ...signOff];
};

const detailsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  marginTop: "2",
  padding: "2.5",
  borderRadius: "md",
  backgroundColor: "neutral.bg.subtle",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
});

const rawStyle = css({
  fontFamily: "mono",
  textStyle: "xs",
  lineHeight: "[18px]",
  color: "neutral.fg.body",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

const linkButtonStyle = css({
  textStyle: "xs",
  color: "neutral.fg.muted",
  cursor: "pointer",
  _hover: { color: "neutral.fg.heading" },
});

/** "Show details" and, opened, the error string with Copy and Contact support. */
export const ErrorDetails = ({
  error,
  initialOpen = false,
}: {
  error: RunError;
  initialOpen?: boolean;
}) => {
  const [open, setOpen] = useState(initialOpen);
  const [copied, setCopied] = useState(false);
  return (
    <span className={css({ display: "flex", flexDirection: "column" })}>
      <button
        type="button"
        className={linkButtonStyle}
        style={{ alignSelf: "flex-start" }}
        aria-expanded={open}
        data-error-toggle={error.id}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        {open ? "Hide details" : "Show details"}
      </button>
      {open ? (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- keeps clicks inside the details off the row
        <span
          className={detailsStyle}
          data-error-details={error.id}
          onClick={(event) => event.stopPropagation()}
        >
          <span className={rawStyle}>{error.raw}</span>
          <span className={quietStyle}>
            {error.step} · {error.time}
          </span>
          <span
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "1",
              marginLeft: "[-6px]",
              whiteSpace: "nowrap",
            })}
          >
            <Button
              size="xs"
              variant="ghost"
              tone="neutral"
              iconName="copy"
              onClick={() => {
                void globalThis.navigator.clipboard
                  ?.writeText(error.raw)
                  .catch(() => undefined);
                setCopied(true);
              }}
            >
              Copy
            </Button>
            <Button size="xs" variant="ghost" tone="neutral">
              Contact support
            </Button>
          </span>
        </span>
      ) : null}
      {copied ? (
        <Toast text="Error copied" onDone={() => setCopied(false)} />
      ) : null}
    </span>
  );
};

const errorRowStyle = css({
  display: "grid",
  gridTemplateColumns: "[16px 1fr auto]",
  columnGap: "3",
  alignItems: "start",
  textStyle: "sm",
});

/** One error: the mark, what failed and its plain reason on one line, then Show details. */
export const ErrorRow = ({
  error,
  initialOpen,
}: {
  error: RunError;
  initialOpen?: boolean;
}) => (
  <div className={errorRowStyle} data-error-row={error.id}>
    <span
      className={css({ display: "inline-flex", alignItems: "center" })}
      style={{ height: 20 }}
    >
      <RunGlyph state="failed" size={12} tooltip={false} />
    </span>
    <span
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "0.5",
        minWidth: "[0]",
      })}
    >
      <span className={css({ color: "neutral.fg.heading" })}>
        {error.where}
        <span className={css({ color: "neutral.fg.subtle" })}>
          {" "}
          · {error.plain}
        </span>
      </span>
      <ErrorDetails error={error} initialOpen={initialOpen} />
    </span>
    <span
      className={css({
        fontFamily: "mono",
        textStyle: "xs",
        lineHeight: "[20px]",
        color: "neutral.fg.subtle",
      })}
    >
      {error.time}
    </span>
  </div>
);

/** v2 and v3: the errors pinned under the summary. */
export const ErrorList = ({
  errors,
  openId,
}: {
  errors: RunError[];
  openId?: string;
}) =>
  errors.length === 0 ? null : (
    <section className={sectionStyle} data-log-errors>
      <div className={labelRowStyle}>
        <span>{errors.length} failed</span>
      </div>
      <div className={css({ display: "flex", flexDirection: "column", gap: "3" })}>
        {errors.map((error) => (
          <ErrorRow
            key={error.id}
            error={error}
            initialOpen={error.id === openId}
          />
        ))}
      </div>
    </section>
  );

/** v3: the technical log behind a fold. */
export const TechnicalFold = ({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={css({ paddingY: "3" })}>
      <button
        type="button"
        aria-expanded={open}
        data-technical-fold
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "1",
          paddingX: "4",
          paddingBottom: "1",
          textStyle: "sm",
          color: "neutral.fg.subtle",
          cursor: "pointer",
          _hover: { color: "neutral.fg.heading" },
        })}
        onClick={() => setOpen(!open)}
      >
        Technical log
        <span className={css({ color: "neutral.fg.muted" })}>· {count} lines</span>
        <Icon name={open ? "chevronDown" : "chevronRight"} size="xs" />
      </button>
      {open ? children : null}
    </div>
  );
};
