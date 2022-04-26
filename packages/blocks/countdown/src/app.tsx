import React, { useEffect, useState, RefCallback } from "react";

import { BlockComponent } from "blockprotocol/react";
import DatePicker from "react-datepicker";

import "react-datepicker/dist/react-datepicker.css";

type AppProps = {
  editableRef?: RefCallback<HTMLElement>;
  localTime?: boolean;
  updateInterval?: number;
  selectsRange?: boolean;
  showWeekNumbers?: boolean;
  showYearDropdown?: boolean;
};

const MILLISECONDS = 1;
const SECONDS = 1000 * MILLISECONDS;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;

export const App: BlockComponent<AppProps> = ({
  editableRef,
  localTime,
  updateInterval,
  selectsRange,
  showWeekNumbers,
  showYearDropdown,
}) => {
  localTime = localTime || false;
  updateInterval = updateInterval || 1;
  selectsRange = selectsRange || false;
  showWeekNumbers = showWeekNumbers || false;
  showYearDropdown = showYearDropdown || false;
  const initialDate = selectsRange
    ? new Date(new Date().setHours(24, 0, 0, 0))
    : new Date();

  const calculateTime = (
    initialStartDate: Date,
    endDate: Date,
    localTime: boolean,
  ) => {
    const now = new Date();
    const timezone_offset = now.getTimezoneOffset() * (localTime ? MINUTES : 0);
    let difference = +initialStartDate - +now + timezone_offset;

    let state = "until";
    if (difference < 0) {
      // Start date is in the past
      difference = +now - +endDate - timezone_offset;
      state = "since";
    }
    if (difference < 0) {
      // End date is in the future
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        millis: 0,
        state: "",
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
      state,
    };
  };

  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);

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

  const onChange = (changes) => {
    if (Array.isArray(changes)) {
      setStartDate(changes[0]);
      setEndDate(changes[1]);
    } else {
      setStartDate(changes);
      setEndDate(changes);
    }
  };

  console.log(editableRef);

  return (
    <div>
      <h1>
        {timeOffset.state.length != 0 ? `Time ${timeOffset.state} ` : ""}
        {editableRef
          ? React.createElement("p", { ref: editableRef })
          : React.createElement("p", {}, "Hello World")}
        :
      </h1>
      <DatePicker
        selected={startDate}
        startDate={startDate}
        endDate={endDate}
        onChange={onChange}
        selectsRange={selectsRange}
        showTimeInput={!selectsRange}
        dateFormat={selectsRange ? "P" : "Pp"}
        showWeekNumbers={showWeekNumbers}
        showYearDropdown={showYearDropdown}
        focusSelectedMonth
      />
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
