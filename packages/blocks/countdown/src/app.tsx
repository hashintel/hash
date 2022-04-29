import React, { useEffect, useState, useRef } from "react";

import { BlockComponent } from "blockprotocol/react";
import DatePicker from "react-datepicker";
import {
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

// const Checkbox = ({ label, value, onChange }) => {
//   return (
//     <label>
//       <input type="checkbox" checked={value} onChange={onChange} />
//       {label}
//     </label>
//   );
// };

const Button = ({ label, onClick }) => {
  return (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  );
};

function formatDate(date, rangeSelection: boolean) {
  if (rangeSelection) {
    return format(date, "PPP");
  } else {
    return formatRelative(date, new Date());
  }
}

function formatRange(range) {
  return `${formatDate(range.start, range.end !== null)} - ${formatDate(
    range.end,
    range.end !== null,
  )}`;
}

function calculateTime(range, strict: boolean) {
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
    offset: formatDate(date, range.end !== null),
    postfix: "",
  };
}

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
  const [range, setRange] = useState({
    start: interval.start === null ? null : new Date(interval.start),
    end: interval.end === null ? null : new Date(interval.end),
  });
  const [rangeSelection, _setRangeSelection] = useState(selectsRange);

  const [clock, setClock] = useState({ now: new Date() });
  const tick = () => setClock({ now: new Date() });
  useEffect(() => {
    // Tick once per second
    setInterval(tick, 1000);
  }, []);
  useEffect(() => {
    tick();
    void updateEntities([
      {
        entityId,
        accountId,
        data: {
          interval: range,
          selectsRange: rangeSelection,
        },
      },
    ]);
  }, [range, rangeSelection, entityId, accountId, updateEntities]);

  useEffect(() => {
    if (rangeSelection && range.start !== null) {
      setRange({
        start: new Date(range.start.setHours(0, 0, 0, 0)),
        end: null,
      });
    } else setRange({ start: range.start, end: null });
  }, [rangeSelection, range.start]);

  const [timeOffset, setTimeOffset] = useState(calculateTime(range, strict));
  useEffect(
    () => setTimeOffset(calculateTime(range, strict)),
    [clock, range, strict],
  ); // Update offset on tick

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
            dateFormat={rangeSelection ? "P" : "Pp"}
            selectsRange={rangeSelection}
            showTimeInput={!rangeSelection}
            showWeekNumbers
            todayButton="Today"
          >
            {/* <Checkbox */}
            {/*  label="Range selection" */}
            {/*  value={rangeSelection} */}
            {/*  onChange={() => setRangeSelection(!rangeSelection)} */}
            {/* /> */}
          </DatePicker>
        </div>
      )}{" "}
      {timeOffset.postfix}
    </div>
  );
};
