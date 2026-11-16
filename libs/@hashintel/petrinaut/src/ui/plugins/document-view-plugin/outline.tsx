import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { outlineRows, type Expansion, type OutlineRow } from "./outline/rows";
import { useRowStops, type RowStop } from "./use-row-stops";

const outlineStyle = css({
  fontFamily: "mono",
  fontSize: "xs",
  lineHeight: "[20px]",
  color: "neutral.s120",
});

const rowStyle = css({
  borderRadius: "xs",
  outline: "none",
  scrollMargin: "[25px]",
  _hover: { backgroundColor: "neutral.bg.subtle" },
  _focusVisible: {
    outline: "[2px solid {colors.neutral.s90}]",
    outlineOffset: "[-2px]",
  },
});

const lineStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "1.5",
  "&[data-folds]": { cursor: "pointer" },
  "& svg": {
    alignSelf: "center",
    flexShrink: 0,
    color: "neutral.s90",
  },
});

/** As wide as a chevron and its gap, so a line without one starts level with the others. */
const chevronWidth = 20;
const indentWidth = 16;

const labelStyle = css({ flexShrink: 0, whiteSpace: "nowrap" });

const punctuationStyle = css({ color: "neutral.s90" });

const emptyStyle = css({ color: "neutral.s90", fontStyle: "italic" });

const valueStyle = cva({
  base: { minWidth: "[0]", overflowWrap: "anywhere" },
  variants: {
    type: {
      string: { color: "green.s100" },
      number: { color: "blue.s100" },
      boolean: { color: "purple.s100" },
      null: { color: "neutral.s90" },
      empty: { color: "neutral.s90" },
      summary: {
        color: "neutral.s90",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      },
    },
  },
});

const blockStyle = css({
  margin: "0",
  paddingY: "1",
  paddingX: "2",
  borderLeftWidth: "[2px]",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.s40",
  font: "[inherit]",
  color: "green.s100",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

/** A key of a map, or in grey an item's place in its list. */
const Label = ({ rowKey }: { rowKey: string | number }) => (
  <span className={typeof rowKey === "number" ? punctuationStyle : undefined}>
    {rowKey}
    <span className={punctuationStyle}>:</span>
  </span>
);

/** What the line of a row says after its key: its value, or what a closed map, list or block holds. */
const Said = ({ value }: { value: OutlineRow["value"] }) => {
  if (value.kind === "scalar") {
    return (
      <span className={valueStyle({ type: value.type })}>{value.text}</span>
    );
  }
  const said =
    value.kind === "collection"
      ? value.open
        ? null
        : value.summary
      : value.open
        ? "|"
        : `| ${value.lineCount} lines`;
  return said === null ? null : (
    <span className={valueStyle({ type: "summary" })}>{said}</span>
  );
};

/** A row takes its turn in the tab order, and its arrows, from its stop. */
const Row = ({
  row,
  onToggle,
  ref,
  tabIndex,
  onFocus,
  onKeyDown: onArrow,
}: RowStop & {
  row: OutlineRow;
  onToggle: () => void;
}) => {
  const { value } = row;
  const folds = value.kind !== "scalar";
  const indent = row.depth * indentWidth;

  return (
    <div
      ref={ref}
      tabIndex={tabIndex}
      onFocus={onFocus}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={folds ? value.open : undefined}
      // The outline is flat: no row holds another, so none owns a selection.
      aria-selected={false}
      className={rowStyle}
      onKeyDown={(event) => {
        if (folds && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        } else {
          onArrow(event);
        }
      }}
    >
      {/* The line toggles, not the block under it, whose text can be selected. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- The row takes the keys. */}
      <div
        className={lineStyle}
        data-folds={folds || undefined}
        style={{ paddingLeft: folds ? indent : indent + chevronWidth }}
        onClick={folds ? onToggle : undefined}
      >
        {folds ? (
          <Icon name={value.open ? "chevronDown" : "chevronRight"} size="xs" />
        ) : null}
        <span className={labelStyle}>
          <Label rowKey={row.key} />
        </span>
        <Said value={value} />
      </div>
      {value.kind === "text" && value.open ? (
        <pre
          className={blockStyle}
          style={{ marginLeft: indent + chevronWidth + indentWidth }}
        >
          {value.text}
        </pre>
      ) : null}
    </div>
  );
};

/**
 * Data as an outline in the manner of YAML: each key with its value, maps,
 * lists and blocks of text opening and closing.
 *
 * The outline is one stop of the tab order, and a worksheet stop table of
 * one column: ArrowUp and ArrowDown walk its rows, ArrowRight opens a closed
 * row and ArrowLeft closes an open one, and Enter, Space or a click on its
 * line does either.
 */
export const Outline = ({
  label,
  data,
  itemNames,
  empty,
  expansion,
  onToggle,
}: {
  /** Names the outline for assistive technology. */
  label: string;
  /** A map or a list. Anything else, or an empty one, shows `empty`. */
  data: unknown;
  /** For data that is a list: what each item goes by from one version of the data to the next, in place of its `id` or its place. */
  itemNames?: readonly string[];
  /** What the outline says while it has no rows. */
  empty: string;
  expansion: Expansion;
  /** Opens or closes the row at a path. */
  onToggle: (path: string) => void;
}) => {
  const rows = outlineRows(data, expansion, itemNames);
  const { attach, rowProps } = useRowStops(
    rows.map(({ path, value }) => {
      const toggle = () => onToggle(path);
      return {
        id: path,
        // The arrow that has nothing to fold stays a move.
        ...(value.kind === "scalar"
          ? {}
          : value.open
            ? { collapse: toggle }
            : { expand: toggle }),
      };
    }),
  );

  return (
    <div ref={attach} role="tree" aria-label={label} className={outlineStyle}>
      {rows.length === 0 ? <p className={emptyStyle}>{empty}</p> : null}
      {rows.map((row) => (
        <Row
          key={row.path}
          row={row}
          onToggle={() => onToggle(row.path)}
          {...rowProps(row.path)}
        />
      ))}
    </div>
  );
};
