import "react-datepicker/dist/react-datepicker.css";
import "./datepicker-override.scss";
import "./styles.scss";

import type { BlockComponent } from "@blockprotocol/graph/react";
import {
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CountdownTitle } from "./countdown-title";
import { DatePickerInput } from "./date-picker-input";
import { Display } from "./display";
import { propertyIds } from "./property-ids";
import type { BlockEntity } from "./types/generated/block-entity";

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const { rootEntity: blockEntity } = useEntitySubgraph(blockEntitySubgraph);
  const {
    metadata: {
      recordId: { entityId },
      entityTypeId,
    },
    properties: {
      [propertyIds.targetDateTime]: targetDate,
      [propertyIds.title]: title,
      [propertyIds.displayTime]: displayTime,
    },
  } = blockEntity;
  const blockRef = useRef<HTMLDivElement>(null);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
  const { graphModule } = useGraphBlockModule(blockRef);
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
      const nextTargetDateTime = data?.targetDate ?? localTargetDate;
      const nextTitle = data?.title ?? localTitle;

      void graphModule.updateEntity({
        data: {
          entityId,
          entityTypeId,
          properties: {
            [propertyIds.displayTime]: data?.displayTime ?? localDisplayTime,
            ...(nextTargetDateTime
              ? {
                  [propertyIds.targetDateTime]:
                    nextTargetDateTime.toISOString(),
                }
              : {}),
            ...(nextTitle ? { [propertyIds.title]: nextTitle } : {}),
          },
        },
      });
    },
    [
      readonly,
      localTargetDate,
      localTitle,
      graphModule,
      entityId,
      entityTypeId,
      localDisplayTime,
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
