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
  intervalToDuration,
} from "date-fns";

import "./base.css";
import "react-datepicker/dist/react-datepicker.css";
import "./datepicker-override.css";
import "./styles.css";
import { defaultDuration, Display } from "./display";
import { DatePickerInput } from "./date-picker-input";
import { CountdownTitle } from "./countdown-title";

type AppProps = {
  title?: string;
  start: string | null;
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

// replace calculateTime with this
// const newCalculateTime = (startDate: Date | null) => {
//   if (startDate === null) return;

//   let interval = defaultDuration;

//   if (isFuture(startDate)) {
//     interval = intervalToDuration({
//       start: startDate,
//       end: new Date(),
//     });
//   }

//   return {
//     interval,
//   };
// };

// @todo confirm if we need since / until / is now

const calculateTime = (start: Date | null, strict: boolean) => {
  const end = new Date();
  if (start === null) {
    return {
      prefix: "",
      offset: "Please select a date",
      postfix: "",
    };
  }

  let relative;
  let date;
  let interval = defaultDuration;
  if (isFuture(start)) {
    date = start;
    relative = "until";
    interval = intervalToDuration({
      start: date,
      end: new Date(),
    });
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
    interval,
  };
};

export const App: BlockComponent<AppProps> = ({
  start = null,
  strict = false,
  title,
  entityId,
  accountId,
  updateEntities,
}) => {
  const [localStart, setLocalStart] = useState<Date | null>(
    !start ? null : new Date(start),
  );

  const [localTitle, setLocalTitle] = useState(title);

  // const [localData, setLocalData] = useState({
  //   start: !start ? null : new Date(start),
  //   title,
  // });

  // add state for time

  const [clock, setClock] = useState({ now: new Date() });
  const tick = () => setClock({ now: new Date() });

  const update = useCallback(
    (newStart: Date | null) => {
      setLocalStart(newStart);
      if (updateEntities) {
        void updateEntities([
          {
            entityId,
            accountId,
            data: {
              start: newStart,
              title: localTitle,
            },
          },
        ]);
      }
    },
    [entityId, accountId, updateEntities, localTitle],
  );

  const updateRemoteTitle = useCallback(() => {
    update(localStart);
  }, [update, localStart]);

  useEffect(() => {
    setLocalStart(!start ? null : new Date(start));
  }, [start]);

  useEffect(() => {
    // Tick at most once per second
    // It might take slightly longer than a second depending on how long it takes to get through other events
    const tickInterval = setInterval(tick, 1000);

    return () => clearInterval(tickInterval);
  }, []);

  const [timeOffset, setTimeOffset] = useState(
    calculateTime(localStart, strict),
  );
  useEffect(
    () => setTimeOffset(calculateTime(localStart, strict)),
    [clock, localStart, strict],
  ); // Update offset on tick

  const onChange = (changes: Date | [Date | null, Date | null] | null) => {
    const newDate = Array.isArray(changes) ? changes[0] : changes;
    update(newDate);
  };

  const datepicker = useRef<DatePicker>(null);

  // useEffect(() => {
  //   if (datepicker.current) datepicker.current.setOpen(isOpen);
  // }, [isOpen]);

  return (
    <div>
      <div className="countdown-block">
        <CountdownTitle
          value={localTitle}
          onChangeText={setLocalTitle}
          onBlur={updateRemoteTitle}
        />
        <Display duration={timeOffset.interval} />
        <div style={{ display: "inline-block" }}>
          <DatePickerInput
            ref={datepicker}
            selected={localStart}
            startDate={localStart}
            onChange={onChange}
            dateFormat="Pp"
            showTimeInput
            showWeekNumbers
            placeholderText="Select a date"
          />
        </div>
      </div>
    </div>
  );
};
