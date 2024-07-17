import type { Duration } from "date-fns";
import { intervalToDuration, isPast } from "date-fns";
import type { FunctionComponent } from "react";
import { useEffect, useState } from "react";

type DisplayProps = {
  targetDate: Date | null;
  displayTime: boolean;
};

const intervals: (keyof Duration)[] = [
  "years",
  "months",
  "days",
  "hours",
  "minutes",
];

export const defaultDuration = {
  years: 0,
  months: 0,
  days: 0,
  hours: 0,
  minutes: 0,
} as Duration;

export const Display: FunctionComponent<DisplayProps> = ({
  targetDate,
  displayTime,
}) => {
  const [_, setClock] = useState(new Date());

  useEffect(() => {
    const tick = () => setClock(new Date());
    // Tick at most once per second
    // It might take slightly longer than a second depending on how long it takes to get through other events
    const tickInterval = setInterval(tick, 1000);

    tick();

    return () => clearInterval(tickInterval);
  }, []);

  const duration = targetDate
    ? intervalToDuration({
        start: new Date(),
        end: targetDate,
      })
    : defaultDuration;

  const filteredIntervals = intervals.reduce<(keyof Duration)[]>((acc, val) => {
    if (!displayTime && ["hours", "minutes"].includes(val)) {
      return acc;
    }
    if (duration[val] ?? acc.length > 0) {
      return [...acc, val];
    }
    return acc;
  }, []);

  const intervalsToDisplay =
    filteredIntervals.length > 0
      ? filteredIntervals
      : (["days"] as (keyof Duration)[]);

  return (
    <div className="countdown-block__display-grid">
      {intervalsToDisplay.map((item) => {
        return (
          <div key={item} className="countdown-block__display-grid__item">
            <p>
              {["minutes"].includes(item)
                ? (duration[item]?.toString().padStart(2, "0") ?? "00")
                : (duration[item] ?? "0")}
            </p>
            <p>{`${item} ${targetDate && isPast(targetDate) ? "ago" : ""}`}</p>
          </div>
        );
      })}
    </div>
  );
};
