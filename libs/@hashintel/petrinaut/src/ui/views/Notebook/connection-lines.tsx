import { useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

/**
 * Width reserved on each side of the cell list for connection lines. The cell
 * list content wrapper must pad its rows by this amount so the lines have
 * empty space to run through.
 */
export const CONNECTION_GUTTER_WIDTH = 32;

/** Horizontal distance between the row edge and where a line attaches. */
const EDGE_INSET = 4;
/** Preferred offset between parallel trunks, narrowed when lines are many. */
const TRUNK_STEP = 3;
/** Innermost trunk position, measured inwards from the gutter's outer edge. */
const FIRST_TRUNK_OFFSET = 14;
/** Space kept clear at the gutter's outer edge. */
const OUTER_MARGIN = 3;

/**
 * Distance from the gutter's outer edge to the vertical trunk of line
 * `index` of `count`. Lines fan outwards from the rows, and the step narrows
 * so that a cell with many connections still shows distinct trunks instead of
 * a single overlapping bundle.
 */
const trunkOffset = (index: number, count: number): number => {
  if (count <= 1) {
    return FIRST_TRUNK_OFFSET;
  }
  const span = FIRST_TRUNK_OFFSET - OUTER_MARGIN;
  const step = Math.min(TRUNK_STEP, span / (count - 1));
  return FIRST_TRUNK_OFFSET - index * step;
};

const overlayStyle = css({
  position: "absolute",
  top: "[0]",
  left: "[0]",
  pointerEvents: "none",
});

const lineStyle = css({
  stroke: "blue.s90",
  strokeWidth: "[1.5]",
  fill: "[none]",
  strokeLinejoin: "round",
  strokeLinecap: "round",
  opacity: "[0.8]",
});

type Line = { fromY: number; toY: number };

type Geometry = {
  width: number;
  height: number;
  leftLines: Line[];
  rightLines: Line[];
};

export interface ConnectionLinesProps {
  /**
   * The positioned (`position: relative`) element containing the cell rows;
   * row positions are measured against it and the overlay fills it.
   */
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedId: string | null;
  /** Cell ids the left-gutter lines connect the selected cell to. */
  upstreamIds: string[];
  /** Cell ids the right-gutter lines connect the selected cell to. */
  downstreamIds: string[];
  /**
   * Every visible row in list order. Reordering or filtering moves rows
   * without resizing the container, which the ResizeObserver cannot see, so
   * this is what tells the overlay to re-measure.
   */
  visibleCellIds: string[];
}

/**
 * Draws Observable-style angled connector lines in the cell list gutters:
 * from the selected cell's row to each of its dependencies (left gutter) and
 * dependents (right gutter). Positions are measured from the DOM and follow
 * layout changes (cells expanding, editors loading) via a ResizeObserver.
 */
export const ConnectionLines: React.FC<ConnectionLinesProps> = ({
  containerRef,
  selectedId,
  upstreamIds,
  downstreamIds,
  visibleCellIds,
}) => {
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  // Serialized so the effect's dependencies stay primitive while the arrays
  // are rebuilt each render; ids are arbitrary imported strings, so JSON is
  // the only safe delimiter.
  const upstreamKey = JSON.stringify(upstreamIds);
  const downstreamKey = JSON.stringify(downstreamIds);
  const rowOrderKey = JSON.stringify(visibleCellIds);

  useEffect(() => {
    const container = containerRef.current;

    const measure = () => {
      if (container === null || selectedId === null) {
        setGeometry(null);
        return;
      }

      const centerY = (id: string): number | null => {
        const row = container.querySelector<HTMLElement>(
          `[data-cell-row="${CSS.escape(id)}"]`,
        );
        return row === null ? null : row.offsetTop + row.offsetHeight / 2;
      };

      const fromY = centerY(selectedId);
      if (fromY === null) {
        setGeometry(null);
        return;
      }

      const toLines = (key: string): Line[] =>
        (JSON.parse(key) as string[])
          .map(centerY)
          .filter((y): y is number => y !== null)
          .map((toY) => ({ fromY, toY }));

      setGeometry({
        width: container.clientWidth,
        height: container.clientHeight,
        leftLines: toLines(upstreamKey),
        rightLines: toLines(downstreamKey),
      });
    };

    const frame = requestAnimationFrame(measure);

    if (container === null) {
      return () => cancelAnimationFrame(frame);
    }

    // Re-measure when the content resizes — cells expanding/collapsing and
    // code editors finishing loading both change row positions.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [containerRef, selectedId, upstreamKey, downstreamKey, rowOrderKey]);

  if (
    geometry === null ||
    (geometry.leftLines.length === 0 && geometry.rightLines.length === 0)
  ) {
    return null;
  }

  const leftPath = ({ fromY, toY }: Line, index: number, count: number) => {
    const edgeX = CONNECTION_GUTTER_WIDTH - EDGE_INSET;
    const trunkX = trunkOffset(index, count);
    return `M ${edgeX} ${fromY} H ${trunkX} V ${toY} H ${edgeX}`;
  };

  const rightPath = ({ fromY, toY }: Line, index: number, count: number) => {
    const edgeX = geometry.width - CONNECTION_GUTTER_WIDTH + EDGE_INSET;
    const trunkX = geometry.width - trunkOffset(index, count);
    return `M ${edgeX} ${fromY} H ${trunkX} V ${toY} H ${edgeX}`;
  };

  return (
    <svg
      className={overlayStyle}
      width={geometry.width}
      height={geometry.height}
      aria-hidden
    >
      {geometry.leftLines.map((line, index) => (
        <path
          key={`left-${line.toY}`}
          className={lineStyle}
          d={leftPath(line, index, geometry.leftLines.length)}
        />
      ))}
      {geometry.rightLines.map((line, index) => (
        <path
          key={`right-${line.toY}`}
          className={lineStyle}
          d={rightPath(line, index, geometry.rightLines.length)}
        />
      ))}
    </svg>
  );
};
