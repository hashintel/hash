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
import "./base.css";

type AppProps = {
  start: string | null;
  end: string | null;
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

const formatRange = (start: Date | null, end: Date | null) => {
  if (start !== null && end !== null) {
    return `${formatDate(start, true)} - ${formatDate(end, true)}`;
  } else {
    return "";
  }
};

const calculateTime = (
  start: Date | null,
  end: Date | null,
  strict: boolean,
) => {
  if (start === null) {
    return {
      prefix: "",
      offset: "Please select a date",
      postfix: "",
    };
  }

  let relative;
  let date;
  if (isFuture(start)) {
    date = start;
    relative = "until";
  } else if (end !== null && isPast(end)) {
    date = end;
    relative = "since";
  } else if (end === null) {
    date = start;
    relative = "since";
  } else {
    return {
      prefix: "",
      offset: formatRange(start, end),
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
    offset: formatDate(date, end !== null),
    postfix: "",
  };
};

export const App: BlockComponent<AppProps> = ({
  start = null,
  end = null,
  selectsRange = false,
  strict = false,
  entityId,
  accountId,
  updateEntities,
}) => {
  const [localStart, setLocalStart] = useState<Date | null>(
    !start ? null : new Date(start),
  );
  const [localEnd, setLocalEnd] = useState<Date | null>(
    !end ? null : new Date(end),
  );
  const [localSelectsRange, setLocalSelectsRange] = useState(selectsRange);

  const [clock, setClock] = useState({ now: new Date() });
  const tick = () => setClock({ now: new Date() });

  const update = useCallback(
    (newStart: Date | null, newEnd: Date | null, newSelectsRange: boolean) => {
      setLocalStart(newStart);
      setLocalEnd(newEnd);
      setLocalSelectsRange(newSelectsRange);
      if (updateEntities) {
        void updateEntities([
          {
            entityId,
            accountId,
            data: {
              start: newStart,
              end: newEnd,
              selectsRange: newSelectsRange,
            },
          },
        ]);
      }
    },
    [entityId, accountId, updateEntities],
  );

  useEffect(() => {
    setLocalStart(!start ? null : new Date(start));
    setLocalEnd(!end ? null : new Date(end));
  }, [start, end]);

  useEffect(() => {
    setLocalSelectsRange(selectsRange);
  }, [selectsRange]);

  useEffect(() => {
    // Tick at most once per second
    // It might take slightly longer than a second depending on how long it takes to get through other events
    const tickInterval = setInterval(tick, 1000);

    return () => clearInterval(tickInterval);
  }, []);

  const [timeOffset, setTimeOffset] = useState(
    calculateTime(localStart, localEnd, strict),
  );
  useEffect(
    () => setTimeOffset(calculateTime(localStart, localEnd, strict)),
    [clock, localStart, localEnd, strict],
  ); // Update offset on tick

  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  const onChange = (changes: Date | [Date | null, Date | null] | null) => {
    if (Array.isArray(changes)) {
      if (changes[1] !== null) {
        close();
      }
      update(changes[0], changes[1], true);
    } else {
      close();
      update(changes, null, false);
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
            selected={localStart}
            startDate={localStart}
            endDate={localEnd}
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
