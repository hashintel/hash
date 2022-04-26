import React, { useEffect, useState, RefCallback } from "react";

import { BlockComponent } from "blockprotocol/react";
import DatePicker from "react-datepicker";
import {
  Interval,
  isFuture,
  isPast,
  formatDistanceToNow,
  formatDistanceToNowStrict,
  formatRelative,
  format,
} from "date-fns";

import "react-datepicker/dist/react-datepicker.css";

type AppProps = {
  updateInterval?: number;
  selectsRange?: boolean;
  showWeekNumbers?: boolean;
  showYearDropdown?: boolean;
  strict?: boolean;
  relative?: boolean;
};

export const App: BlockComponent<AppProps> = ({
  updateInterval,
  selectsRange,
  showWeekNumbers,
  showYearDropdown,
  strict,
  relative,
}) => {
  updateInterval = updateInterval || 1;
  selectsRange = selectsRange || false;
  showWeekNumbers = showWeekNumbers || false;
  showYearDropdown = showYearDropdown || false;
  strict = strict || false;
  relative = relative || false;

  const formatDate = (date) => {
    if (relative) {
      return formatRelative(date, new Date());
    } else {
      return selectsRange ? format(date, "PP") : format(date, "PPPp");
    }
  };

  const formatRange = (date) => {
    return `${formatDate(range.start)} - ${formatDate(range.end)}`;
  };

  const calculateTime = (range) => {
    let relative;
    let date;
    if (isFuture(range.start)) {
      date = range.start;
      relative = "until";
    } else if (range.end !== null && isPast(range.end)) {
      date = range.end;
      relative = "since";
    } else if (range.end === null) {
      date = range.start;
      relative = "since";
    } else {
      return {
        prefix: "",
        offset: formatRange(range),
        postfix: "is now",
      };
    }

    let distance;
    if (strict) {
      distance = formatDistanceToNowStrict(date);
    } else {
      distance = formatDistanceToNow(date, { includeSeconds: true });
    }

    return {
      prefix: `${distance} ${relative}`,
      offset: formatDate(date),
      postfix: "",
    };
  };

  const initialDate = selectsRange
    ? new Date(new Date().setHours(0, 0, 0, 0)) // Ranges can't specify time
    : new Date();

  const [clock, setClock] = useState({ now: new Date() });
  const tick = () => setClock({ now: new Date() });
  useEffect(() => {
    // Tick once per second
    setInterval(tick, 1000);
  }, []);

  const [range, setRange] = useState({ start: initialDate, end: initialDate });
  useEffect(tick, [range]); // Tick on update

  const [timeOffset, setTimeOffset] = useState(calculateTime(range));
  useEffect(() => setTimeOffset(calculateTime(range)), [clock]); // Update offset on tick

  const [isOpen, setIsOpen] = useState(false);

  const onChange = (changes) => {
    if (Array.isArray(changes)) {
      setRange({ start: changes[0], end: changes[1] });
    } else {
      setRange({ start: changes, end: null });
    }
  };

  const onClick = (event) => {
    event.preventDefault();
    setIsOpen(!isOpen);
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") setIsOpen(false);
  };

  return (
    <div>
      <div>
        {timeOffset.prefix}{" "}
        <button onClick={onClick} onKeyDown={onKeyDown}>
          {timeOffset.offset}
        </button>{" "}
        {timeOffset.postfix}
      </div>
      {isOpen && (
        <DatePicker
          selected={range.start}
          startDate={range.start}
          endDate={range.end}
          onChange={onChange}
          onKeyDown={onKeyDown}
          closeOnScroll={true}
          selectsRange={selectsRange}
          showTimeSelect={!selectsRange}
          showWeekNumbers={showWeekNumbers}
          focusSelectedMonth
          inline
        />
      )}
    </div>
  );
};
