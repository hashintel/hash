/**
 * `?runcols=1` (6 Nov sync, B8): the Logs runs table without "Run 17 · Today, 08:15" in one column (Ciarán: a
 * counting number has no scope across webs, and a date mixed into it can't sort). Unset keeps today's table.
 *
 * ID | Status | Started | Ended | Started by | Web | Outputs | Duration. The ID is a short slice of the run's UUID
 * (`run-id.ts`, form picked by `?runid=`, "a" when unset). Every header sorts on click, a second click flips it;
 * Status and Started by stay in Filter. Web: a member of several webs sees runs from each (Dei).
 */
import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { type RunRecord, runClock } from "./run-history";
import { runId, runIdTake, RunIdText } from "./run-id";
import { durationSeconds } from "./runs-filter";

export const runColsTake = () =>
  new URLSearchParams(globalThis.location.search).get("runcols") === "1";

/** The ID form the table uses: the `?runid=` take, or 2 characters. */
export const tableIdTake = () => runIdTake() ?? "a";

export type ColumnKey =
  | "id"
  | "status"
  | "started"
  | "completed"
  | "by"
  | "web"
  | "duration";

const shortMonths = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** When a run started, from "Today, 08:15", "2 Nov, 16:20" or "1 Dec 2025, 09:00" and its start clock. */
export const startedAt = (run: RunRecord, now: number) => {
  const [day = "", time = "00:00"] = run.when.split(", ");
  const [h = 0, m = 0, s = 0] = run.startClock.split(":").map(Number);
  const today = new Date(now);
  if (day === "Today") {
    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      h,
      m,
      s,
    );
  }
  const [date = "1", month = "Jan", year] = day.split(" ");
  const [hh = h, mm = m] = time.split(":").map(Number);
  return new Date(
    year ? Number(year) : today.getFullYear(),
    Math.max(0, shortMonths.indexOf(month)),
    Number(date),
    hh,
    mm,
    s,
  );
};

/** When it ended; null while it runs. */
export const endedAt = (run: RunRecord, now: number) => {
  if (run.kind === "live" && !run.stopped) {
    return null;
  }
  const seconds =
    run.kind === "live" ? runClock(run, now) : durationSeconds(run, now);
  return new Date(startedAt(run, now).getTime() + seconds * 1000);
};

const part = (value: number) => String(value).padStart(2, "0");

/** "Today, 08:15", "2 Nov, 16:20", "1 Dec 2025, 09:00". */
export const dateText = (date: Date, now: number) => {
  const today = new Date(now);
  const time = `${part(date.getHours())}:${part(date.getMinutes())}`;
  if (date.toDateString() === today.toDateString()) {
    return `Today, ${time}`;
  }
  const year =
    date.getFullYear() === today.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${shortMonths[date.getMonth()]}${year}, ${time}`;
};

/** The web a run belongs to. MOCK: Dora's personal web for some of her manual runs, @hash for the rest. */
export const webOf = (run: RunRecord) =>
  run.trigger.kind === "manual" && run.id % 3 === 1 ? "@dora" : "@hash";

export const startedByText = (run: RunRecord) =>
  run.trigger.kind === "manual" ? run.trigger.by : "Schedule";

/** Text columns start A–Z; times and durations start newest or longest first. */
export const columnOrders: Record<
  Exclude<ColumnKey, "status">,
  { label: string; orders: [string, string] }
> = {
  id: { label: "ID", orders: ["A–Z", "Z–A"] },
  started: { label: "Start time", orders: ["Newest first", "Oldest first"] },
  completed: { label: "End time", orders: ["Newest first", "Oldest first"] },
  by: { label: "Started by", orders: ["A–Z", "Z–A"] },
  web: { label: "Web", orders: ["A–Z", "Z–A"] },
  duration: { label: "Duration", orders: ["Longest first", "Shortest first"] },
};

/** Compares two runs on a column in its first order (before the flip). Status is ranked by the table. */
export const compareOn = (
  key: Exclude<ColumnKey, "status">,
  a: RunRecord,
  b: RunRecord,
  now: number,
) => {
  switch (key) {
    case "id":
      return runId(a, tableIdTake()).localeCompare(runId(b, tableIdTake()));
    case "started":
      return startedAt(b, now).getTime() - startedAt(a, now).getTime();
    case "completed": {
      // A run still going has no end yet, so it sorts as the newest.
      const end = (run: RunRecord) =>
        endedAt(run, now)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return end(b) - end(a);
    }
    case "by":
      return startedByText(a).localeCompare(startedByText(b));
    case "web":
      return webOf(a).localeCompare(webOf(b));
    case "duration":
      return durationSeconds(b, now) - durationSeconds(a, now);
  }
};

const headButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  height: "[32px]",
  whiteSpace: "nowrap",
  fontFamily: "[inherit]",
  fontSize: "[inherit]",
  fontWeight: "[inherit]",
  color: "[inherit]",
  cursor: "pointer",
  "& [data-sort-mark]": { opacity: "0" },
  "&:hover": { color: "neutral.fg.body" },
  "&:hover [data-sort-mark]": { opacity: "0.5" },
  "&[data-active]": { color: "neutral.fg.heading" },
  "&[data-active] [data-sort-mark]": { opacity: "1" },
});

/** A header that sorts its column: the arrow shows on hover, and stays on the active column. */
export const SortHead = ({
  label,
  active,
  flipped,
  align,
  onSort,
}: {
  label: string;
  active: boolean;
  flipped: boolean;
  align?: "right";
  onSort: () => void;
}) => (
  <th
    aria-sort={active ? (flipped ? "ascending" : "descending") : undefined}
    style={align ? { textAlign: "right" } : undefined}
  >
    <button
      type="button"
      className={headButtonStyle}
      data-active={active || undefined}
      onClick={onSort}
    >
      {label}
      <span data-sort-mark className={css({ display: "inline-flex" })}>
        <Icon name={active && flipped ? "sortUp" : "sortDown"} size="xs" />
      </span>
    </button>
  </th>
);

const idCellStyle = css({
  fontWeight: "medium",
  color: "neutral.fg.heading",
  fontVariantNumeric: "tabular-nums",
});

const mutedStyle = css({ color: "neutral.fg.subtle" });

export const IdCell = ({ run }: { run: RunRecord }) => (
  <td className={idCellStyle}>
    <RunIdText run={run} take={tableIdTake()} />
  </td>
);

/** A time; "Ended" gives only the clock when the run ended on the day it started. */
export const TimeCell = ({
  date,
  now,
  sameDayAs,
}: {
  date: Date | null;
  now: number;
  sameDayAs?: Date;
}) => (
  <td className={css({ fontVariantNumeric: "tabular-nums" })}>
    {!date ? (
      <span className={mutedStyle}>–</span>
    ) : sameDayAs && sameDayAs.toDateString() === date.toDateString() ? (
      `${part(date.getHours())}:${part(date.getMinutes())}`
    ) : (
      dateText(date, now)
    )}
  </td>
);

/** Nine columns fit beside the right panel: 16 px between columns, the first keeping the page's 24 px edge. */
export const colsTableStyle = css({
  "& th, & td": { paddingX: "4" },
  "& th:first-child, & td:first-child": { paddingLeft: "6" },
  "& th:last-child, & td:last-child": { paddingRight: "6" },
});

/** Outputs gives way so the nine columns fit: 220 px, fading out at the edge (the counts open the viewer). */
export const outputsCellStyle = css({
  maxWidth: "[220px]",
  overflow: "hidden",
  maskImage: "[linear-gradient(to right, black calc(100% - 32px), transparent)]",
});

export const StartedByCell = ({ run }: { run: RunRecord }) => (
  <td>{startedByText(run)}</td>
);

export const WebCell = ({ run }: { run: RunRecord }) => (
  <td className={mutedStyle}>{webOf(run)}</td>
);
