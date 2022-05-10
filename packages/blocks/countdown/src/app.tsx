import React, { useEffect, useState, useRef, useCallback } from "react";

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

interface Interval {
  start: Date | null;
  end: Date | null;
}

type AppProps = {
  interval: {
    start?: Date | string;
    end?: Date | string;
  };
  selectsRange: boolean;
  strict: boolean;
};

const formatDate = (date: Date, rangeSelection: boolean) => {
  if (rangeSelection) {
    return format(date, "PPP");
  } else {
    return formatRelative(date, new Date());
  }
};

const formatRange = (interval: Interval) => {
  if (interval.start !== null && interval.end !== null) {
    return `${formatDate(interval.start, true)} - ${formatDate(
      interval.end,
      true,
    )}`;
  } else {
    return "";
  }
};

const calculateTime = (interval: Interval, strict: boolean) => {
  if (interval.start === null) {
    return {
      prefix: "",
      offset: "Please select a date",
      postfix: "",
    };
  }

  let relative;
  let date;
  if (isFuture(interval.start)) {
    date = interval.start;
    relative = "until";
  } else if (interval.end !== null && isPast(interval.end)) {
    date = interval.end;
    relative = "since";
  } else if (interval.end === null) {
    date = interval.start;
    relative = "since";
  } else {
    return {
      prefix: "",
      offset: formatRange(interval),
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
    offset: formatDate(date, interval.end !== null),
    postfix: "",
  };
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
  const [localInterval, setLocalInterval] = useState<Interval>({
    start: !interval.start ? null : new Date(interval.start),
    end: !interval.end ? null : new Date(interval.end),
  });
  const [localSelectsRange, setLocalSelectsRange] = useState(selectsRange);

  const [clock, setClock] = useState({ now: new Date() });
  const tick = () => setClock({ now: new Date() });

  const update = useCallback(
    (interval: Interval, selectsRange: boolean) => {
      setLocalInterval(interval);
      setLocalSelectsRange(selectsRange);
      if (updateEntities) {
        void updateEntities([
          {
            entityId,
            accountId,
            data: {
              interval,
              selectsRange,
            },
          },
        ]);
      }
    },
    [entityId, accountId, updateEntities],
  );

  useEffect(() => {
    const newInterval = {
      start: !interval.start ? null : new Date(interval.start),
      end: !interval.end ? null : new Date(interval.end),
    };
    if (
      newInterval.start !== localInterval.start ||
      newInterval.end !== localInterval.end
    )
      setLocalInterval(newInterval);
    if (selectsRange != localSelectsRange) setLocalSelectsRange(selectsRange);
  }, [interval]);

  useEffect(() => {
    // Tick at least once per second
    // It might take slightly longer than a second depending on how long it takes to get through other events
    setInterval(tick, 1000);
  }, []);

  const [timeOffset, setTimeOffset] = useState(
    calculateTime(localInterval, strict),
  );
  useEffect(
    () => setTimeOffset(calculateTime(localInterval, strict)),
    [clock, localInterval, strict],
  ); // Update offset on tick

  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  const onChange = (changes: Date | [Date | null, Date | null] | null) => {
    console.log(`onChange(${JSON.stringify(changes)})`);
    if (Array.isArray(changes)) {
      if (changes[1] !== null) {
        close();
      }
      update({ start: changes[0], end: changes[1] }, true);
    } else {
      close();
      update({ start: changes, end: null }, false);
    }
  };

  const datepicker = useRef<DatePicker>(null);
  useEffect(() => {
    if (datepicker.current) datepicker.current.setOpen(isOpen);
  }, [isOpen]);

  return (
    <div>
      {timeOffset.prefix}{" "}
      {isOpen || (
        <button type="button" onClick={open}>
          {timeOffset.offset}
        </button>
      )}
      {isOpen && (
        <div style={{ display: "inline-block" }}>
          <DatePicker
            ref={datepicker}
            selected={localInterval.start}
            startDate={localInterval.start}
            endDate={localInterval.end}
            onChange={onChange}
            onCalendarClose={close}
            onSelect={() => localSelectsRange || close()}
            dateFormat={localSelectsRange ? "P" : "Pp"}
            selectsRange={localSelectsRange}
            showTimeInput={!localSelectsRange}
            showWeekNumbers
            todayButton="Today"
          >
            <label>
              <input
                type="checkbox"
                checked={localSelectsRange}
                onChange={() => setLocalSelectsRange(!localSelectsRange)}
              />
              Range selection
            </label>
          </DatePicker>
        </div>
      )}{" "}
      {timeOffset.postfix}
    </div>
  );
};
