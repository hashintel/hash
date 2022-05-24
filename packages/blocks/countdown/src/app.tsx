import React, { useEffect, useState, useCallback } from "react";

import { BlockComponent } from "blockprotocol/react";

import "react-datepicker/dist/react-datepicker.css";
import "./base.css";
import "./datepicker-override.css";
import { Display } from "./display";
import { DatePickerInput } from "./date-picker-input";
import { CountdownTitle } from "./countdown-title";

type AppProps = {
  title?: string;
  start: string | null;
  displayTime?: boolean;
};

export const App: BlockComponent<AppProps> = ({
  start = null,
  title,
  displayTime,
  entityId,
  accountId,
  updateEntities,
}) => {
  const [localStart, setLocalStart] = useState<Date | null>(
    !start ? null : new Date(start),
  );
  const [localTitle, setLocalTitle] = useState(title);
  // const [displayTime, setDisplayTime] = useState(false);

  // add state for time

  useEffect(() => {
    setLocalStart(!start ? null : new Date(start));
  }, [start]);

  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  const updateRemoteData = useCallback(
    (data?: { title?: string; start?: Date | null }) => {
      if (updateEntities) {
        void updateEntities([
          {
            entityId,
            accountId,
            data: {
              start: data?.start ?? localStart,
              title: data?.title ?? localTitle,
            },
          },
        ]);
      }
    },
    [entityId, accountId, updateEntities, localTitle, localStart],
  );

  const handleDateChange = useCallback(
    (changes: Date | [Date | null, Date | null] | null) => {
      const newDate = Array.isArray(changes) ? changes[0] : changes;
      setLocalStart(newDate);
      updateRemoteData({ start: newDate });
    },
    [updateRemoteData],
  );

  return (
    <div>
      <div className="countdown-block">
        <CountdownTitle
          value={localTitle}
          onChangeText={setLocalTitle}
          onBlur={updateRemoteData}
        />
        <Display targetDate={localStart} />
        <DatePickerInput
          selected={localStart}
          onChange={handleDateChange}
          dateFormat="Pp"
          // showTimeInput
          showWeekNumbers
          placeholderText="Select a date"
          displayTime={displayTime}
        />
      </div>
    </div>
  );
};
