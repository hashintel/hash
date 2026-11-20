/* oxlint-disable hash/no-magic-numbers -- The numbers are illustrative temporal data and SVG coordinates. */
import { useId } from "react";

import styles from "./temporal-axes.module.css";

import type { ReactNode } from "react";

const versions = [
  { name: "A", decision: [3.5, 5], transaction: [5, 6.5] },
  { name: "B", decision: [1, 3], transaction: [3, 10] },
  { name: "C", decision: [5, 7], transaction: [7, 10] },
] as const;

const labels = {
  title: "A query selects along a line, not a rectangle",
  description:
    "Decision time runs right and transaction time runs up. A diagonal marks equal times. The grey region below it has decision time greater than transaction time. Three entity versions occupy rectangles. A query pins transaction time to day 8 and selects decision times from day 1 to day 8. Its horizontal line intersects versions B and C. Version A is below the line and is not selected.",
  decision: "Decision time (day)",
  transaction: "Transaction time (day)",
  query: "query",
  laterDecision: "decision time >",
  earlierTransaction: "transaction time",
  caption:
    "Transaction time is pinned to day 8. The decision-time interval [1, 8] intersects B and C, but not A. Selecting a single instant on both axes gives a point instead of a line.",
};

const ticks = [2, 4, 6, 8, 10];
const query = { pinned: 8, start: 1, end: 8 };
const decisionPosition = (day: number): number => 56 + day * 28;
const transactionPosition = (day: number): number => 204 - day * 18;

function VersionRectangles(): ReactNode {
  return versions.map((version) => {
    const selected =
      version.transaction[0] <= query.pinned &&
      query.pinned < version.transaction[1] &&
      version.decision[0] <= query.end &&
      query.start < version.decision[1];
    const left = decisionPosition(version.decision[0]);
    const top = transactionPosition(version.transaction[1]);
    return (
      <g
        key={version.name}
        className={styles["version"]}
        data-selected={selected}
      >
        <rect
          x={left}
          y={top}
          width={decisionPosition(version.decision[1]) - left}
          height={transactionPosition(version.transaction[0]) - top}
        />
        <text
          x={decisionPosition((version.decision[0] + version.decision[1]) / 2)}
          y={top + 18}
        >
          {version.name}
        </text>
      </g>
    );
  });
}

/** Contrasts a version's two intervals with a query's pinned axis. */
export function TemporalAxes(): ReactNode {
  const id = useId();
  const queryHeight = transactionPosition(query.pinned);

  return (
    <figure className={styles["figure"]} data-temporal-axes="">
      <svg
        viewBox="0 0 360 270"
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An inline SVG needs image semantics while retaining theme-aware elements.
        role="img"
        aria-labelledby={`${id}-title ${id}-description`}
      >
        <title id={`${id}-title`}>{labels.title}</title>
        <desc id={`${id}-description`}>{labels.description}</desc>
        <path
          className={styles["later-decision-region"]}
          d={`M ${decisionPosition(0)} ${transactionPosition(0)} H ${decisionPosition(10)} V ${transactionPosition(10)} Z`}
        />
        <g className={styles["grid"]}>
          {ticks.map((day) => (
            <path
              key={day}
              d={`M ${decisionPosition(day)} 24 V 204 M 56 ${transactionPosition(day)} H 336`}
            />
          ))}
        </g>
        <path
          className={styles["equal-time"]}
          d={`M ${decisionPosition(0)} ${transactionPosition(0)} L ${decisionPosition(10)} ${transactionPosition(10)}`}
        />
        <text className={styles["later-decision-label"]} x={250} y={154}>
          <tspan x={250}>{labels.laterDecision}</tspan>
          <tspan x={250} dy={17}>
            {labels.earlierTransaction}
          </tspan>
        </text>
        <VersionRectangles />
        <path
          className={styles["axis"]}
          d="M 56 16 V 204 H 344 M 52 22 L 56 16 L 60 22 M 338 200 L 344 204 L 338 208"
        />
        <g className={styles["tick"]}>
          {ticks.map((day) => (
            <g key={day}>
              <text x={decisionPosition(day)} y={224}>
                {day}
              </text>
              <text
                className={styles["transaction-tick"]}
                x={46}
                y={transactionPosition(day) + 4}
              >
                {day}
              </text>
            </g>
          ))}
        </g>
        <text className={styles["label"]} x={196} y={254}>
          {labels.decision}
        </text>
        <text
          className={styles["label"]}
          transform="translate(16 114) rotate(-90)"
        >
          {labels.transaction}
        </text>
        <path
          className={styles["guide"]}
          d={`M 56 ${queryHeight} H ${decisionPosition(query.start)}`}
        />
        <g className={styles["query"]}>
          <path
            d={`M ${decisionPosition(query.start)} ${queryHeight} H ${decisionPosition(query.end)}`}
          />
          <circle cx={decisionPosition(query.start)} cy={queryHeight} r={3} />
          <circle cx={decisionPosition(query.end)} cy={queryHeight} r={3} />
          <text x={decisionPosition(query.end) + 8} y={queryHeight + 4}>
            {labels.query}
          </text>
        </g>
      </svg>
      <figcaption>{labels.caption}</figcaption>
    </figure>
  );
}
