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
  strict: boolean;
};

const Checkbox = ({ label, value, onChange }) => {
  return (
    <label>
      <input type="checkbox" checked={value} onChange={onChange} />
      {label}
    </label>
  );
};

const Button = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>;
};

export const App: BlockComponent<AppProps> = ({
  interval = {
    start: null,
    end: null,
  },
  selectsRange = false,
  strict = false,
  entityId,
  accountId,
  updateEntities,
}) => {
  const formatDate = (date) => {
    if (rangeSelection) {
      return format(date, "PPP");
    } else {
      return formatRelative(date, new Date());
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

  const [rangeSelection, setRangeSelection] = useState(selectsRange);
  useEffect(() => {
    if (rangeSelection && range.start !== null)
      setRange({
        start: new Date(range.start.setHours(0, 0, 0, 0)),
        end: null,
      });
    else setRange({ start: range.start, end: null });

    updateEntities([
      {
        entityId,
        accountId,
        data: {
          selectsRange: rangeSelection,
        },
      },
    ]);
  }, [rangeSelection]);

  const [timeOffset, setTimeOffset] = useState(calculateTime(range));
  useEffect(() => setTimeOffset(calculateTime(range)), [clock]); // Update offset on tick

  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  const onChange = (changes) => {
    const [start, end] = Array.isArray(changes)
      ? [changes[0], changes[1]]
      : [changes, null];
    setRange({ start, end });

    if (rangeSelection && end !== null) close();
  };

  const datepicker = useRef(null);
  useEffect(
    () => datepicker.current && isOpen && datepicker.current.setOpen(true),
    [isOpen],
  );

  return (
    <div>
      {timeOffset.prefix}{" "}
      {isOpen || <Button onClick={open} label={timeOffset.offset} />}
      {isOpen && (
        <div style={{ display: "inline-block" }}>
          <DatePicker
            ref={datepicker}
            selected={range.start}
            startDate={range.start}
            endDate={range.end}
            onChange={onChange}
            onCalendarClose={close}
            onSelect={() => rangeSelection || close()}
            selectsRange={rangeSelection}
            showTimeInput={!rangeSelection}
            showWeekNumbers
            todayButton="Today"
          >
            <Checkbox
              label="Range selection"
              value={rangeSelection}
              onChange={() => setRangeSelection(!rangeSelection)}
            />
          </DatePicker>
        </div>
      )}{" "}
      {timeOffset.postfix}
    </div>
  );
};
