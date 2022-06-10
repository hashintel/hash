import React, { useEffect, useState, useCallback, useRef } from "react";

import { BlockComponent, useGraphBlockService } from "@blockprotocol/graph";

import { Display } from "./display";
import { DatePickerInput } from "./date-picker-input";
import { CountdownTitle } from "./countdown-title";

import "./styles.scss";
import "react-datepicker/dist/react-datepicker.css";
import "./datepicker-override.scss";

type AppProps = {
  title?: string;
  targetDate: string | null;
  displayTime?: boolean;
};

export const App: BlockComponent<AppProps> = ({ graph: { blockEntity } }) => {
  const {
    entityId,
    properties: { targetDate, title, displayTime },
  } = blockEntity;
  const blockRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRef);
  const [localTargetDate, setLocalTargetDate] = useState<Date | null>(
    !targetDate ? null : new Date(targetDate),
  );
  const [localTitle, setLocalTitle] = useState(title);
  const [localDisplayTime, setLocalDisplayTime] = useState(false);

  useEffect(() => {
    setLocalTargetDate(!targetDate ? null : new Date(targetDate));
  }, [targetDate]);

  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  useEffect(() => {
    setLocalDisplayTime(!!displayTime);
  }, [displayTime]);

  const updateRemoteData = useCallback(
    (data?: {
      title?: string;
      targetDate?: Date | null;
      displayTime?: boolean;
    }) => {
      void graphService?.updateEntity({
        data: {
          entityId,
          properties: {
            displayTime: data?.displayTime ?? localDisplayTime,
            targetDate: data?.targetDate ?? localTargetDate,
            title: data?.title ?? localTitle,
          },
        },
      });
    },
    [graphService, entityId, localDisplayTime, localTargetDate, localTitle],
  );

  const handleDateChange = useCallback(
    (changes: Date | [Date | null, Date | null] | null) => {
      const newTargetDate = Array.isArray(changes) ? changes[0] : changes;
      setLocalTargetDate(newTargetDate);
      updateRemoteData({ targetDate: newTargetDate });
    },
    [updateRemoteData],
  );

  const handleDisplayTimeChange = useCallback(
    (newDisplayTime) => {
      setLocalDisplayTime(newDisplayTime);
      updateRemoteData({ displayTime: newDisplayTime });
    },
    [updateRemoteData],
  );

  return (
    <div ref={blockRef} className="countdown-block">
      <CountdownTitle
        value={localTitle}
        onChangeText={setLocalTitle}
        onBlur={updateRemoteData}
      />
      <Display targetDate={localTargetDate} displayTime={!!localDisplayTime} />
      <DatePickerInput
        selected={localTargetDate}
        onChange={handleDateChange}
        displayTime={localDisplayTime}
        setDisplayTime={handleDisplayTimeChange}
      />
    </div>
  );
};
