import React, { VFC } from "react";
// import { Duration } from "date-fns";

type Duration = {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

type DisplayProps = {
  duration: Duration;
};

const intervals: (keyof Duration)[] = [
  "years",
  "months",
  "days",
  "hours",
  "minutes",
  "seconds",
];

const defaultDuration = {
  years: 0,
  months: 0,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
} as Duration;

export const Display: VFC<DisplayProps> = ({ duration = defaultDuration }) => {
  //   console.log("duration => ", duration);

  //   @todo, seconds/minutes should still remain if hours/days are present
  //   const x = intervals.reduce<(keyof Duration)[]>((acc, val) => {

  //     return [...acc, val];
  //   }, []);

  const filteredIntervals = intervals.filter((interval) => {
    if (duration[interval] <= 0) {
      return false;
    }
    return true;
  });

  const intervalsToDisplay =
    filteredIntervals.length > 0
      ? filteredIntervals
      : (["days"] as (keyof Duration)[]);

  return (
    <div className="display-grid">
      {intervalsToDisplay.map((item) => {
        return (
          <div key={item} className="display-grid__item">
            <p>{duration[item] ?? 0}</p>
            <p>{item}</p>
          </div>
        );
      })}
    </div>
  );
};
