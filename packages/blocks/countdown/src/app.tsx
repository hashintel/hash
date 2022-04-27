import React, { useEffect, useState, useRef } from "react";

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
  interval: {
    start?: Date | string;
    end?: Date | string;
  };
  selectsRange: boolean;
  showWeekNumbers: boolean;
  showYearDropdown: boolean;
  strict: boolean;
  relative: boolean;
};

export const App: BlockComponent<AppProps> = ({
  interval = {
    start: null,
    end: null,
  },
  selectsRange = false,
  showWeekNumbers = true,
  strict = true,
  relative = true,
  entityId,
  accountId,
  updateEntities,
}) => {
  const formatDate = (date) => {
    if (relative) {
      return formatRelative(date, new Date());
    } else {
      return selectsRange ? format(date, "PP") : format(date, "PPPp");
    }
  };

  const formatRange = (range) => {
    return `${formatDate(range.start)} - ${formatDate(range.end)}`;
  };

  const calculateTime = (range) => {
    if (range.start === null) {
      return {
        prefix: "",
        offset: "Please select a date",
        postfix: "",
      };
    }
    // console.log(range);
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

  const [clock, setClock] = useState({ now: new Date() });
  const tick = () => setClock({ now: new Date() });
  useEffect(() => {
    // Tick once per second
    setInterval(tick, 1000);
  }, []);

  const [range, setRange] = useState({
    start: interval.start === null ? null : new Date(interval.start),
    end: interval.end === null ? null : new Date(interval.end),
  });
  useEffect(() => {
    tick();
    updateEntities([
      {
        entityId,
        accountId,
        data: {
          interval: range,
        },
      },
    ]);
  }, [range]);

  const [timeOffset, setTimeOffset] = useState(calculateTime(range));
  useEffect(() => setTimeOffset(calculateTime(range)), [clock]); // Update offset on tick

  const [isOpen, setIsOpen] = useState(false);
  const close = () => {
    console.log("close");
    setIsOpen(false);
  };
  const toggle = () => {
    console.log("toggle");
    setIsOpen(!isOpen);
  };
  const closeOnEscape = (event) => {
    if (event.key === "Escape") close();
  };

  const onChange = (changes) => {
    const [start, end] = Array.isArray(changes)
      ? [changes[0], changes[1]]
      : [changes, null];
    setRange({ start, end });

    if (selectsRange && end !== null) close();
  };

  const onClick = (event) => {
    console.log("onClick");
    toggle();
    event.preventDefault();
  };

  const onSelect = () => {
    // Don't close when selecting a range.
    if (!selectsRange) close();
  };

  const button = useRef(null);
  const onClickOutside = (event) => {
    // Prevent action when pressing button
    if (button.current && !button.current.contains(event.target)) close();
  };

  const datepicker = useRef(null);
  const focus = () => {
    console.log(datepicker.current);
    datepicker.current && datepicker.current.setFocus();
  };
  useEffect(() => isOpen && focus(), [isOpen]);

  return (
    <div>
      {timeOffset.prefix}{" "}
      <button ref={button} onClick={toggle} onKeyDown={closeOnEscape}>
        {timeOffset.offset}
      </button>{" "}
      {timeOffset.postfix}
      {isOpen && (
        <DatePicker
          ref={datepicker}
          autofocus
          selected={range.start}
          startDate={range.start}
          endDate={range.end}
          onChange={onChange}
          onSelect={onSelect}
          onKeyDown={closeOnEscape}
          onClickOutside={onClickOutside}
          closeOnScroll={true}
          selectsRange={selectsRange}
          showTimeSelect={!selectsRange}
          showTimeInput={!selectsRange}
          showWeekNumbers={showWeekNumbers}
        />
      )}
    </div>
  );
};
