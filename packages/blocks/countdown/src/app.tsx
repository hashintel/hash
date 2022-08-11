import { useEffect, useState, useCallback, useRef } from "react";

import {
  BlockComponent,
  useGraphBlockService,
} from "@blockprotocol/graph/react";

import { Display } from "./display";
import { DatePickerInput } from "./date-picker-input";
import { CountdownTitle } from "./countdown-title";

import "./styles.scss";
import "react-datepicker/dist/react-datepicker.css";
import "./datepicker-override.scss";

type BlockEntityProperties = {
  title?: string;
  targetDate: string | null;
  displayTime?: boolean;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: { blockEntity, readonly },
}) => {
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
      if (readonly) {
        return;
      }
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
    [
      graphService,
      entityId,
      localDisplayTime,
      localTargetDate,
      localTitle,
      readonly,
    ],
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
    (newDisplayTime: boolean) => {
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
        readonly={!!readonly}
      />
      <Display targetDate={localTargetDate} displayTime={!!localDisplayTime} />
      <DatePickerInput
        selected={localTargetDate}
        onChange={handleDateChange}
        displayTime={localDisplayTime}
        setDisplayTime={handleDisplayTimeChange}
        readonly={!!readonly}
      />
    </div>
  );
};
