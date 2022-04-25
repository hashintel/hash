import React, { useEffect, useState } from "react";

import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  name?: string;
  startDate: Date;
  endDate?: Date;
  duration?: number;
  localTime?: boolean;
  updateInterval?: number;
};

const MILLISECONDS = 1;
const SECONDS = 1000 * MILLISECONDS;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;

export const App: BlockComponent<AppProps> = ({
  name,
  startDate,
  endDate,
  duration,
  localTime,
  updateInterval,
}) => {
  const calculateTime = (
    startDate: Date,
    endDate: Date,
    localTime: boolean,
  ) => {
    const now = new Date();
    const timezone_offset = now.getTimezoneOffset() * (localTime ? MINUTES : 0);
    let difference = +startDate - +now + timezone_offset;
    if (difference < 0) {
      // Start date is in the past
      difference = +now - +endDate - timezone_offset;
    }
    if (difference < 0) {
      // End date is in the future
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        millis: 0,
      };
    }

    return {
      days: Math.floor(difference / DAYS),
      hours: Math.floor((difference % DAYS) / HOURS),
      minutes: Math.floor((difference % HOURS) / MINUTES)
        .toString()
        .padStart(2, "0"),
      seconds: Math.floor((difference % MINUTES) / SECONDS)
        .toString()
        .padStart(2, "0"),
      millis: Math.floor((difference % SECONDS) / MILLISECONDS)
        .toString()
        .padStart(3, "0"),
    };
  };

  if (duration === undefined) duration = 0;
  if (endDate === undefined)
    endDate = new Date(+startDate + duration * SECONDS);
  if (updateInterval === undefined) updateInterval = 1;

  const [timeOffset, setTimeOffset] = useState(
    calculateTime(startDate, endDate, localTime),
  );

  useEffect(() => {
    setTimeout(() => {
      setTimeOffset(calculateTime(startDate, endDate, localTime));
    }, updateInterval * SECONDS);
  });

  const style = (timeUnit: number) => {
    return updateInterval * SECONDS < timeUnit ? {} : { display: "none" };
  };

  return (
    <div>
      <h1>{name}</h1>
      <span id="days">{timeOffset.days}d </span>
      <span id="hours" style={style(DAYS)}>
        {timeOffset.hours}h{" "}
      </span>
      <span id="minutes" style={style(HOURS)}>
        {timeOffset.minutes}m{" "}
      </span>
      <span id="seconds" style={style(MINUTES)}>
        {timeOffset.seconds}s{" "}
      </span>
      <span id="millis" style={style(SECONDS)}>
        {timeOffset.millis}ms
      </span>
    </div>
  );
};
