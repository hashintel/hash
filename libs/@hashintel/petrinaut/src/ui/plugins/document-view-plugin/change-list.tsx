import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { onOneLine } from "./outline/rows";
import { emptyStyle, rowStopStyle, useRowStops } from "./use-row-stops";

import type { DocChangeEvent, PetrinautPatch } from "../../plugin";

const listStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  lineHeight: "[18px]",
  color: "neutral.s120",
});

/**
 * Two columns: the operation, as wide as the longest one's name so that
 * paths start level, then the path with the value under it. Neither wraps.
 */
const lineStyle = css({
  display: "grid",
  gridTemplateColumns: "[7ch minmax(0, 1fr)]",
  columnGap: "2",
  paddingY: "0.5",
  paddingX: "1",
  whiteSpace: "nowrap",
  "& > *": { overflow: "hidden", textOverflow: "ellipsis" },
  // A rule between one change and the one before it.
  "&[data-starts-change]:not(:first-child)": {
    marginTop: "1.5",
    paddingTop: "2",
    borderTop: "[1px solid {colors.neutral.s30}]",
    borderTopRadius: "[0]",
  },
  // A restore is no patch, and is set apart from them.
  "&[data-op=restore]": { backgroundColor: "purple.bg.subtle" },
});

const opStyle = cva({
  base: { fontWeight: "medium" },
  variants: {
    op: {
      add: { color: "green.s100" },
      replace: { color: "blue.s100" },
      remove: { color: "red.s100" },
      restore: { color: "purple.s100" },
    },
  },
});

/** Under the path, a little smaller. */
const valueStyle = css({
  gridColumn: "2",
  fontSize: "[11px]",
  color: "neutral.s90",
});

/** A change the handle reported, under its number among them: its rows go by it, and stay its own when a newer change arrives. */
export type RecordedChange = {
  readonly serial: number;
  readonly change: DocChangeEvent;
};

/** What a row says: what was done, to what, and the value that left there. */
type Line = {
  op: PetrinautPatch["op"] | "restore";
  target: string;
  value?: unknown;
};

/**
 * The lines of a change: one for each of its patches. A move through the
 * handle's history is one line instead, a `restore` of the entry the handle
 * names, with the document that entry holds.
 */
const linesOf = ({ next, patches = [], restored }: DocChangeEvent): Line[] =>
  restored
    ? [{ op: "restore", target: onOneLine(restored), value: next }]
    : patches.map(({ op, path, value }) => ({
        op,
        target: `/${path.join("/")}`,
        value,
      }));

/**
 * The changes, latest first, each line on two rows that do not wrap: what
 * was done and to what, then the value that left there. A rule sets one
 * change apart from the next. The list is one stop of the tab order, walked
 * by ArrowUp and ArrowDown.
 */
export const ChangeList = ({
  changes,
  empty,
}: {
  changes: readonly RecordedChange[];
  /** What the list says while there are no changes. */
  empty: string;
}) => {
  const rows = changes.flatMap(({ serial, change }) => {
    const lines = linesOf(change);
    // A handle that reports no patches still made a change.
    return (lines.length > 0 ? lines : [null]).map((line, index) => ({
      id: `${serial}/${index}`,
      startsChange: index === 0,
      line,
    }));
  });
  const { attach, rowProps } = useRowStops(rows);

  return (
    <div ref={attach} role="list" aria-label="Changes" className={listStyle}>
      {rows.length === 0 ? <p className={emptyStyle}>{empty}</p> : null}
      {rows.map(({ id, startsChange, line }) => (
        <div
          key={id}
          role="listitem"
          className={cx(rowStopStyle, lineStyle)}
          data-starts-change={startsChange || undefined}
          data-op={line?.op}
          {...rowProps(id)}
        >
          {line === null ? (
            <span className={valueStyle}>No patches reported</span>
          ) : (
            <>
              <span className={opStyle({ op: line.op })}>{line.op}</span>
              <span>{line.target}</span>
              {line.value === undefined ? null : (
                <span className={valueStyle}>{onOneLine(line.value)}</span>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
};
