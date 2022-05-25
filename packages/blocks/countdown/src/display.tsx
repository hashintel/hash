import React, { useEffect, useState, VFC } from "react";
import { Duration, intervalToDuration, isPast } from "date-fns";

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
  "seconds",
];

export const defaultDuration = {
  years: 0,
  months: 0,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
} as Duration;

export const Display: VFC<DisplayProps> = ({ targetDate, displayTime }) => {
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
    if (!displayTime && ["hours", "minutes", "seconds"].includes(val)) {
      return acc;
    }
    if (duration[val] || acc.length > 0) {
      return [...acc, val];
    }
    return acc;
  }, []);

  const intervalsToDisplay =
    filteredIntervals.length > 0
      ? filteredIntervals
      : (["days"] as (keyof Duration)[]);

  return (
    <div className="display-grid">
      {intervalsToDisplay.map((item) => {
        return (
          <div key={item} className="display-grid__item">
            <p>
              {["seconds", "minutes"].includes(item)
                ? duration[item]?.toString().padStart(2, "0") ?? "00"
                : duration[item] ?? "0"}
            </p>
            <p>{`${item} ${targetDate && isPast(targetDate) ? "ago" : ""}`}</p>
          </div>
        );
      })}
    </div>
  );
};
