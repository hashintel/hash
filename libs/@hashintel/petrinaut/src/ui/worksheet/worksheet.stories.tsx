import { Fragment, type ReactNode, useRef, useState } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { focusLands } from "./focus-flow";
import { FocusRoot, FocusStack } from "./focus-stack";
import { useFocusGrid, type FocusGrid } from "./use-focus-grid";
import { useFocusHeader } from "./use-focus-member";
import {
  useFocusStops,
  type FocusStop,
  type FocusStops,
  type FocusStopTarget,
} from "./use-focus-stops";

import type { Meta, StoryObj } from "@storybook/react-vite";

// -- Styles ---------------------------------------------------------------

const pageStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "[16px]",
});

const introStyle = css({
  maxWidth: "[560px]",
  fontSize: "sm",
  lineHeight: "[20px]",
  color: "neutral.s80",
});

const columnsStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "[24px]",
});

const columnStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const gridBoxStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  padding: "[8px]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "[6px]",
});

const gridTitleStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
});

const gridRowStyle = css({
  display: "flex",
  gap: "[4px]",
});

const containedPairStyle = css({
  display: "flex",
  gap: "[12px]",
  padding: "[8px]",
  borderWidth: "[1px]",
  borderStyle: "dashed",
  borderColor: "blue.s50",
  borderRadius: "[6px]",
});

const stopsTableStyle = css({
  display: "grid",
  gridTemplateColumns: "[36px repeat(3, 104px)]",
  gap: "[4px]",
  width: "[fit-content]",
  padding: "[8px]",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "[6px]",
});

const sparseLabelStyle = css({
  gridColumn: "[span 2]",
  display: "flex",
  alignItems: "center",
  paddingX: "[8px]",
  fontSize: "xs",
  color: "neutral.s80",
});

const sectionHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  height: "[28px]",
  paddingX: "[8px]",
  fontSize: "xs",
  fontWeight: "medium",
  textAlign: "left",
  color: "neutral.s120",
  backgroundColor: "neutral.s20",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "[4px]",
  cursor: "pointer",
  _focus: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[1px]",
  },
});

const cellStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "[56px]",
    height: "[28px]",
    paddingX: "[8px]",
    fontSize: "xs",
    color: "neutral.s120",
    backgroundColor: "neutral.s05",
    borderWidth: "[1px]",
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
    borderRadius: "[4px]",
    cursor: "pointer",
    _focus: {
      outline: "[2px solid {colors.blue.s50}]",
      outlineOffset: "[1px]",
    },
  },
  variants: {
    tone: {
      plain: {},
      header: {
        fontWeight: "medium",
        backgroundColor: "neutral.s20",
      },
      gutter: {
        minWidth: "[36px]",
        paddingX: "[0px]",
        backgroundColor: "neutral.s20",
      },
      strip: {
        gridColumn: "[1 / -1]",
        backgroundColor: "neutral.s20",
      },
    },
  },
  defaultVariants: { tone: "plain" },
});

// -- Demo building blocks -------------------------------------------------

const range = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index);

const StoryFrame = ({
  intro,
  children,
}: {
  intro: string;
  children: ReactNode;
}) => (
  <div className={pageStyle}>
    <p className={introStyle}>{intro}</p>
    {children}
  </div>
);

const GridCell = ({
  grid,
  row,
  column,
  label,
}: {
  grid: FocusGrid;
  row: number;
  column: number;
  label: string;
}) => (
  <button
    type="button"
    ref={grid.register(row, column)}
    tabIndex={grid.tabIndexFor(row, column)}
    onKeyDown={grid.onKeyDown(row, column)}
    onFocus={() => grid.onFocusCell(row, column)}
    className={cellStyle()}
  >
    {label}
  </button>
);

/** A bordered rows-by-columns grid of buttons, one member of the flow. */
const DemoGrid = ({
  label,
  rows,
  columns,
}: {
  label: string;
  rows: number;
  columns: number;
}) => {
  const grid = useFocusGrid();
  return (
    <div
      ref={(element) => grid.attach(element)}
      aria-label={label}
      className={gridBoxStyle}
    >
      <div className={gridTitleStyle}>{label}</div>
      {range(rows).map((row) => (
        <div key={row} className={gridRowStyle}>
          {range(columns).map((column) => (
            <GridCell
              key={column}
              grid={grid}
              row={row}
              column={column}
              label={`${row},${column}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

// -- Meta -----------------------------------------------------------------

const meta = {
  title: "worksheet/FocusStack",
  component: FocusStack,
  parameters: {
    layout: "padded",
  },
  args: {
    axis: "horizontal",
    children: null,
  },
} satisfies Meta<typeof FocusStack>;

export default meta;

type Story = StoryObj<typeof meta>;

// -- Two columns ----------------------------------------------------------

const TwoColumnsExample = ({ entry }: { entry?: "remembered" | "aligned" }) => (
  <FocusRoot>
    <div className={columnsStyle}>
      <FocusStack axis="horizontal" entry={entry}>
        <FocusStack axis="vertical">
          <div className={columnStyle}>
            <DemoGrid label="Left top grid" rows={2} columns={3} />
            <DemoGrid label="Left bottom grid" rows={3} columns={2} />
          </div>
        </FocusStack>
        <FocusStack axis="vertical">
          <div className={columnStyle}>
            <DemoGrid label="Right top grid" rows={3} columns={3} />
            <DemoGrid label="Right bottom grid" rows={2} columns={2} />
          </div>
        </FocusStack>
      </FocusStack>
    </div>
  </FocusRoot>
);

export const TwoColumns: Story = {
  render: () => (
    <StoryFrame
      intro={
        "Two columns, each a vertical stack of two grids of different sizes. " +
        "Click any cell, then move with the arrow keys: running off a grid's " +
        "edge crosses into the neighbouring grid or column, and every grid " +
        "remembers the cell you last visited, so crossing back returns there " +
        "(the default entry). Tab and Shift+Tab jump grid to grid — each " +
        "grid is a single tab stop with a roving tabindex."
      }
    >
      <TwoColumnsExample />
    </StoryFrame>
  ),
};

// -- Aligned entry --------------------------------------------------------

export const AlignedEntry: Story = {
  render: () => (
    <StoryFrame
      intro={
        'The same layout with entry="aligned" on the horizontal stack — the ' +
        "stack that routes a move decides the policy, and inner stacks pass " +
        "it through. Crossing into a neighbour keeps the row of a horizontal " +
        "move, landing on the nearest cell instead of the neighbour's " +
        "remembered cell. Try ArrowRight from different rows of the left " +
        "grids and watch the row carry across."
      }
    >
      <TwoColumnsExample entry="aligned" />
    </StoryFrame>
  ),
};

// -- Contained ------------------------------------------------------------

const ContainedExample = () => (
  <FocusRoot>
    <div className={columnStyle}>
      <FocusStack axis="vertical">
        <DemoGrid label="Top grid" rows={2} columns={3} />
        <FocusStack axis="horizontal" contain>
          <div className={containedPairStyle}>
            <DemoGrid label="Inner left grid" rows={2} columns={2} />
            <DemoGrid label="Inner right grid" rows={2} columns={2} />
          </div>
        </FocusStack>
        <DemoGrid label="Bottom grid" rows={2} columns={3} />
      </FocusStack>
    </div>
  </FocusRoot>
);

export const Contained: Story = {
  render: () => (
    <StoryFrame
      intro={
        "A vertical stack whose middle member is a horizontal stack with " +
        "contain (the dashed border). Arrow down from the top grid to enter " +
        "the pair, then try to leave with the arrow keys: Left and Right " +
        "cross between the two inner grids, but no arrow escapes the pair " +
        "— Up and Down are refused. Tab still moves freely in and out."
      }
    >
      <ContainedExample />
    </StoryFrame>
  ),
};

// -- Stops table ----------------------------------------------------------

const STOPS: FocusStop[] = [
  { id: "header", kind: "row" },
  { id: "strip", kind: "full" },
  { id: "process-1", kind: "row", gutter: true },
  { id: "process-2", kind: "row", gutter: true },
  { id: "process-3", kind: "row", gutter: true },
  { id: "shared", kind: "sparse", columns: [1, 2] },
];

const STOPS_COLUMN_COUNT = 3;

const targetKey = (target: FocusStopTarget) =>
  `${target.stopId}:${target.column}`;

const StopCell = ({
  table,
  targets,
  position,
  label,
  ariaLabel,
  tone = "plain",
  reportFocus = true,
}: {
  table: FocusStops;
  targets: { current: Map<string, HTMLElement> };
  position: FocusStopTarget;
  label: string;
  ariaLabel?: string;
  tone?: "plain" | "header" | "gutter" | "strip";
  /**
   * A full-width stop has no column of its own; reporting its wired column
   * (0) on focus would overwrite the column memory that vertical moves
   * carry across it, so the strip skips the report.
   */
  reportFocus?: boolean;
}) => (
  <button
    type="button"
    ref={(element) => {
      if (element) {
        targets.current.set(targetKey(position), element);
      } else {
        targets.current.delete(targetKey(position));
      }
    }}
    aria-label={ariaLabel}
    tabIndex={table.tabIndexFor(position)}
    onKeyDown={table.onKeyDown(position)}
    onFocus={reportFocus ? () => table.onFocusTarget(position) : undefined}
    className={cellStyle({ tone })}
  >
    {label}
  </button>
);

const StopsTableExample = () => {
  const targets = useRef(new Map<string, HTMLElement>());
  const table = useFocusStops({
    stops: STOPS,
    columnCount: STOPS_COLUMN_COUNT,
    focusTarget: (target) => focusLands(targets.current.get(targetKey(target))),
  });

  const headerLabels = ["Name", "Rate", "Unit"];
  const processRows = [
    { stopId: "process-1", cells: ["Mix", "0.4", "per s"] },
    { stopId: "process-2", cells: ["Heat", "1.2", "per s"] },
    { stopId: "process-3", cells: ["Cool", "0.7", "per s"] },
  ];
  const sharedCells: { column: number; label: string }[] = [
    { column: 1, label: "1.0" },
    { column: 2, label: "per s" },
  ];

  return (
    <FocusRoot>
      <div
        ref={(element) => table.attach(element)}
        aria-label="Process table"
        className={stopsTableStyle}
      >
        <div />
        {headerLabels.map((label, column) => (
          <StopCell
            key={label}
            table={table}
            targets={targets}
            position={{ stopId: "header", column }}
            label={label}
            tone="header"
          />
        ))}
        <StopCell
          table={table}
          targets={targets}
          position={{ stopId: "strip", column: 0 }}
          label="3 processes (full-width strip)"
          tone="strip"
          reportFocus={false}
        />
        {processRows.map((row) => (
          <Fragment key={row.stopId}>
            <StopCell
              table={table}
              targets={targets}
              position={{ stopId: row.stopId, column: "gutter" }}
              label="⋮"
              ariaLabel={`${row.cells[0]} row gutter`}
              tone="gutter"
            />
            {row.cells.map((label, column) => (
              <StopCell
                key={`${row.stopId}-${label}`}
                table={table}
                targets={targets}
                position={{ stopId: row.stopId, column }}
                label={label}
              />
            ))}
          </Fragment>
        ))}
        <div className={sparseLabelStyle}>shared (cols 1–2)</div>
        {sharedCells.map((cell) => (
          <StopCell
            key={cell.column}
            table={table}
            targets={targets}
            position={{ stopId: "shared", column: cell.column }}
            label={cell.label}
          />
        ))}
      </div>
    </FocusRoot>
  );
};

export const StopsTable: Story = {
  render: () => (
    <StoryFrame
      intro={
        "A non-uniform table built with useFocusStops. The ⋮ gutter is its " +
        "own lane: ArrowUp/Down stay gutter to gutter, ArrowRight enters " +
        "the row's cells at column 0, and ArrowLeft from column 0 returns " +
        "to the gutter. Vertical moves remember your column across the " +
        "full-width strip — go down from the Rate header and you resurface " +
        "in the Rate column — and the sparse shared line has cells only in " +
        "its two declared columns, entered at the nearest one."
      }
    >
      <StopsTableExample />
    </StoryFrame>
  ),
};

// -- Mixed controls -------------------------------------------------------

const ActionRow = () => {
  const grid = useFocusGrid();
  const actions = ["Run", "Pause", "Reset"];
  return (
    <div
      ref={(element) => grid.attach(element)}
      aria-label="Action row"
      className={gridBoxStyle}
    >
      <div className={gridTitleStyle}>Action row (one-row grid)</div>
      <div className={gridRowStyle}>
        {actions.map((label, column) => (
          <GridCell
            key={label}
            grid={grid}
            row={0}
            column={column}
            label={label}
          />
        ))}
      </div>
    </div>
  );
};

const MixedControlsExample = () => {
  const [expanded, setExpanded] = useState(true);
  const header = useFocusHeader({
    collapse: () => setExpanded(false),
    expand: () => setExpanded(true),
  });
  return (
    <FocusRoot>
      <div className={columnStyle}>
        <FocusStack axis="vertical">
          <button
            type="button"
            ref={(element) => header.attach(element)}
            onKeyDown={(event) => header.onHeaderKeyDown(event)}
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className={sectionHeaderStyle}
          >
            {expanded ? "▾" : "▸"} Reaction rates
          </button>
          {expanded ? (
            <DemoGrid label="Section grid" rows={2} columns={3} />
          ) : null}
          <ActionRow />
        </FocusStack>
      </div>
    </FocusRoot>
  );
};

export const MixedControls: Story = {
  render: () => (
    <StoryFrame
      intro={
        "A vertical stack mixing member kinds: a collapsible section " +
        "header, its grid, and a row of plain buttons registered as a " +
        "one-row grid (one tab stop; ArrowLeft/Right walk it). On the " +
        "header, ArrowLeft collapses and ArrowRight expands — a header " +
        "with collapse handlers claims the horizontal keys and never emits " +
        "horizontal moves — while ArrowUp/Down leave to the neighbouring " +
        "members. Collapse the section and ArrowDown lands straight on the " +
        "action row."
      }
    >
      <MixedControlsExample />
    </StoryFrame>
  ),
};
