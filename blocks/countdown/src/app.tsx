import "react-datepicker/dist/react-datepicker.css";
import "./datepicker-override.scss";
import "./styles.scss";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
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
    setLocalDisplayTime(Boolean(displayTime));
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
    <div ref={blockRef} className={"countdown-block"}>
      <CountdownTitle
        value={localTitle}
        readonly={Boolean(readonly)}
        onChangeText={setLocalTitle}
        onBlur={updateRemoteData}
      />
      <Display
        targetDate={localTargetDate}
        displayTime={Boolean(localDisplayTime)}
      />
      <DatePickerInput
        selected={localTargetDate}
        displayTime={localDisplayTime}
        setDisplayTime={handleDisplayTimeChange}
        readonly={Boolean(readonly)}
        onChange={handleDateChange}
      />
    </div>
  );
};
