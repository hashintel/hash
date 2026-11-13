/**
 * The Logs stats as 2×2 tiles with the short run ID (6 Nov, Aakarsh on the earlier tiles: "I thought they looked
 * quite good"). The 5 Nov tiles lost only because "Run 15 · 2 Nov, 16:20" didn't fit a 118 px tile; with the short
 * ID ("A4", `run-id.ts`) it can. Read from `?stats=t1..t4` only; S4 rows stay the default.
 * - t1: the date is the value, "Last failure · A4" the label.
 * - t2: the ID is the value, the date under it.
 * - t3: relative time ("4 days ago") is the value, the exact time on hover.
 * - t4: rows for the failure and warnings, tiles for Next run and Average run time.
 */
import type { ReactNode } from "react";

import { Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import type { RunRecord } from "./run-history";
import { runId } from "./run-id";
import { startedAt, tableIdTake } from "./runs-columns";

/** The tile for runs that are done with failed items: "With warnings" before the status grammar. */
const withWarningsName = "Items failed";

export type StatTilesTake = "t1" | "t2" | "t3" | "t4";

export const statTilesTake = (): StatTilesTake | null => {
  const value = new URLSearchParams(globalThis.location.search).get("stats");
  return value === "t1" || value === "t2" || value === "t3" || value === "t4"
    ? value
    : null;
};

/** One run fact (the last failure, the only run with warnings): which run, and the colour its value takes. */
export type RunFact = { run: RunRecord; color: string; open: () => void };

export type StatTilesFacts = {
  lastFailure: RunFact | null;
  /** The only run with warnings; a count when several have them; null when none. */
  warnings: RunFact | number | null;
  nextRun: Date;
  average: string;
  averageHint: string;
  now: number;
};

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

const part = (value: number) => String(value).padStart(2, "0");

const dayText = (date: Date) =>
  `${date.getDate()} ${shortMonths[date.getMonth()]}`;

const clockText = (date: Date) =>
  `${part(date.getHours())}:${part(date.getMinutes())}`;

/** "4 days ago", "2 hours ago", "Yesterday", "in 25 days". */
export const relativeText = (date: Date, now: number) => {
  const minutesApart = Math.round((date.getTime() - now) / 60_000);
  const past = minutesApart <= 0;
  const size = Math.abs(minutesApart);
  const unit = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? "" : "s"}`;
  const amount =
    size < 60
      ? unit(Math.max(1, size), "minute")
      : size < 60 * 24
        ? unit(Math.round(size / 60), "hour")
        : unit(Math.round(size / (60 * 24)), "day");
  if (past && size >= 60 * 24 && size < 60 * 48) {
    return "Yesterday";
  }
  return past ? `${amount} ago` : `in ${amount}`;
};

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "[1fr 1fr]",
  gap: "2",
});

const tileStyle = css({
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: "1",
  minWidth: "[0]",
  minHeight: "[76px]",
  padding: "3",
  borderRadius: "lg",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  backgroundColor: "neutral.bgSolid.surface",
  textAlign: "left",
});

const openTileStyle = css({
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.surface.hover" },
});

// The DS tooltip trigger sets line-height 0, so the value carries its own block box and line height.
const valueStyle = css({
  display: "block",
  textStyle: "md",
  lineHeight: "[24px]",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

const subStyle = css({
  textStyle: "xs",
  color: "neutral.fg.body",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

const labelStyle = css({
  textStyle: "xs",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  height: "[32px]",
  textStyle: "sm",
});

const Hint = ({ text, children }: { text?: string; children: ReactNode }) =>
  text ? (
    <Tooltip content={text} openDelay="fast">
      {children}
    </Tooltip>
  ) : (
    children
  );

type Tile = {
  key: string;
  value: string;
  color?: string;
  sub?: string;
  label: string;
  hint?: string;
  open?: () => void;
};

const TileView = ({ tile }: { tile: Tile }) => {
  const body = (
    <>
      <span className={css({ display: "flex", flexDirection: "column" })}>
        <Hint text={tile.hint}>
          <span
            className={valueStyle}
            style={tile.color ? { color: tile.color } : undefined}
            data-stat-value
          >
            {tile.value}
          </span>
        </Hint>
        {tile.sub ? (
          <span className={subStyle} data-stat-sub>
            {tile.sub}
          </span>
        ) : null}
      </span>
      <span className={labelStyle} data-stat-label>
        {tile.label}
      </span>
    </>
  );
  return tile.open ? (
    <button
      type="button"
      className={cx(tileStyle, openTileStyle)}
      onClick={tile.open}
      data-stat-tile={tile.key}
    >
      {body}
    </button>
  ) : (
    <div className={tileStyle} data-stat-tile={tile.key}>
      {body}
    </div>
  );
};

export const StatTiles = ({
  take,
  facts,
}: {
  take: StatTilesTake;
  facts: StatTilesFacts;
}) => {
  const { now } = facts;
  const idOf = (run: RunRecord) => runId(run, tableIdTake());
  const runTile = (
    key: string,
    name: string,
    fact: RunFact | number | null,
  ): Tile => {
    if (fact === null) {
      return { key, value: "None", label: name };
    }
    if (typeof fact === "number") {
      return { key, value: `${fact} runs`, label: name };
    }
    const at = startedAt(fact.run, now);
    const id = idOf(fact.run);
    // "Yesterday, 16:20" (124 px) is the one date that overflows a 118 px tile, so tiles give yesterday its date.
    const when = fact.run.when.startsWith("Yesterday")
      ? `${dayText(at)}, ${clockText(at)}`
      : fact.run.when;
    // "With warnings · 3FA4" is 121 px; "Warnings · 3FA4" fits every ID take.
    const short = name === withWarningsName ? withWarningsName : name;
    const base = { key, color: fact.color, open: fact.open };
    switch (take) {
      case "t2":
        return { ...base, value: id, sub: when, label: name };
      case "t3":
        return {
          ...base,
          value: relativeText(at, now),
          label: `${short} · ${id}`,
          hint: when,
        };
      default:
        return { ...base, value: when, label: `${short} · ${id}` };
    }
  };
  const next = facts.nextRun;
  const nextTile: Tile =
    take === "t2"
      ? {
          key: "next",
          value: dayText(next),
          sub: `${clockText(next)} · Schedule`,
          label: "Next run",
        }
      : take === "t3"
        ? {
            key: "next",
            value: relativeText(next, now),
            label: "Next run",
            hint: `${dayText(next)}, ${clockText(next)}`,
          }
        : {
            key: "next",
            value: `${dayText(next)}, ${clockText(next)}`,
            label: "Next run",
          };
  const averageTile: Tile = {
    key: "average",
    value: facts.average,
    // "Median of done runs" is 148 px, so the tile says "Median" and the hover says the rest.
    sub: take === "t2" ? "Median" : undefined,
    label: "Average run time",
    hint: facts.averageHint,
  };
  if (take === "t4") {
    const rows = [
      { name: "Last failure", fact: facts.lastFailure },
      ...(facts.warnings === null
        ? []
        : [{ name: withWarningsName, fact: facts.warnings }]),
    ];
    return (
      <div
        data-stats-take={take}
        className={css({ display: "flex", flexDirection: "column", gap: "2" })}
      >
        <div className={css({ display: "flex", flexDirection: "column" })}>
          {rows.map(({ name, fact }) => (
            <div key={name} className={rowStyle} data-stat-row={name}>
              <span className={css({ color: "neutral.fg.muted" })}>{name}</span>
              {fact === null || typeof fact === "number" ? (
                <span className={css({ color: "neutral.fg.body" })}>
                  {fact === null ? "None" : `${fact} runs`}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={fact.open}
                  className={css({
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                    cursor: "pointer",
                    _hover: {
                      textDecoration: "underline",
                      textUnderlineOffset: "[2px]",
                    },
                  })}
                  style={{ color: fact.color }}
                  data-stat-value
                >
                  {idOf(fact.run)} · {fact.run.when}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className={gridStyle}>
          <TileView tile={nextTile} />
          <TileView tile={averageTile} />
        </div>
      </div>
    );
  }
  const tiles = [
    runTile("failure", "Last failure", facts.lastFailure),
    ...(facts.warnings === null
      ? []
      : [runTile("warnings", withWarningsName, facts.warnings)]),
    nextTile,
    averageTile,
  ];
  return (
    <div data-stats-take={take} className={gridStyle}>
      {tiles.map((tile) => (
        <TileView key={tile.key} tile={tile} />
      ))}
    </div>
  );
};
