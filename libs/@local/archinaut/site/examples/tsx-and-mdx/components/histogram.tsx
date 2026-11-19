import { sums } from "./dice.ts";

/**
 * One bar per sum of two dice, scaled to the largest value shown, with the
 * count under each bar. `expected`, when given, marks where each bar would
 * stand if the rolls followed the 36 ways exactly.
 */
export const Histogram = ({
  counts,
  expected,
  highlight,
}: {
  counts: readonly number[];
  expected?: readonly number[];
  highlight?: number;
}) => {
  const largest = Math.max(1, ...counts, ...(expected ?? []));
  const percent = (value: number): string => `${(value / largest) * 100}%`;
  return (
    <figure
      className="dice-histogram"
      aria-label="Counts of each sum of two dice"
    >
      <ol>
        {sums.map((sum, index) => {
          const count = counts[index] ?? 0;
          const mark = expected?.[index];
          return (
            <li key={sum} data-highlight={sum === highlight}>
              <span className="dice-histogram__plot">
                <span
                  className="dice-histogram__bar"
                  style={{ height: percent(count) }}
                />
                {mark === undefined ? null : (
                  <span
                    className="dice-histogram__expected"
                    style={{ bottom: percent(mark) }}
                  />
                )}
              </span>
              <span className="dice-histogram__count">{count}</span>
              <span className="dice-histogram__sum">{sum}</span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
};
