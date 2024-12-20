import "./app.scss";

import type { BlockComponent } from "@blockprotocol/graph/react";
import {
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { isValid, parseISO } from "date-fns";
import * as duration from "duration-fns";
import type { MouseEventHandler } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import { calculateDurationStepLength } from "./app/calculate-duration-step-length";
import { clamp } from "./app/clamp";
import { DurationInput } from "./app/duration-input";
import type { TimerStatus } from "./app/timer-status";
import { useAutoRefresh } from "./app/use-auto-refresh";
import { propertyIds } from "./property-ids";
import type {
  BlockEntity,
  TimerBlockProgressPropertyValue,
} from "./types/generated/block-entity";

type TimerState = {
  initialDurationInMs: number;
  pauseDurationInMs?: number;
  targetTimestamp?: number;
};

export type BlockEntityProperties = {
  /** https://en.wikipedia.org/wiki/ISO_8601#Durations */
  initialDuration: string;
  /** https://en.wikipedia.org/wiki/ISO_8601#Durations */
  pauseDuration?: string;
  /** https://en.wikipedia.org/wiki/ISO_8601 */
  targetDateTime?: string;
};

const defaultInitialDurationInMs = duration.toMilliseconds(
  duration.parse("PT5M"),
);
const minInitialDurationInMs = 1000;
const maxInitialDurationInMs = (100 * 60 - 1) * 1000;

const normalizeDurationMinutesAndSeconds = (
  value: duration.DurationInput,
): duration.Duration => {
  const rawResult = duration.normalize(value);
  return {
    ...rawResult,
    minutes: rawResult.minutes + rawResult.hours * 60,
    hours: 0,
  };
};

const parseDateIfPossible = (value: string | undefined): number | undefined => {
  if (value) {
    const result = parseISO(value);
    if (isValid(result)) {
      return result.valueOf();
    }
  }
  return undefined;
};

const parseDurationIfPossible = (
  value: string | undefined,
): number | undefined => {
  if (value) {
    try {
      return duration.toMilliseconds(
        duration.parse(duration.toMilliseconds(value)),
      );
    } catch {
      // noop
    }
  }

  return undefined;
};

const getPauseDuration = (timerProgress?: TimerBlockProgressPropertyValue) => {
  if (timerProgress && propertyIds.pauseDuration in timerProgress) {
    return timerProgress[propertyIds.pauseDuration];
  }
};

const getTargetDateTime = (timerProgress?: TimerBlockProgressPropertyValue) => {
  if (timerProgress && propertyIds.targetDateTime in timerProgress) {
    return timerProgress[propertyIds.targetDateTime];
  }
};

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const { rootEntity } = useEntitySubgraph(blockEntitySubgraph);

  const { entityId } = rootEntity.metadata.recordId;
  const { entityTypeId } = rootEntity.metadata;

  const {
    [propertyIds.totalDuration]: initialDuration = "PT5M",
    [propertyIds.progress]: timerProgress,
  } = rootEntity.properties;

  const pauseDuration = getPauseDuration(timerProgress);
  const targetDateTime = getTargetDateTime(timerProgress);

  const blockRef = useRef<HTMLDivElement>(null);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
  const { graphModule } = useGraphBlockModule(blockRef);

  const externalTimerState = useMemo<TimerState>(() => {
    const unclampedPauseDuration = parseDurationIfPossible(pauseDuration);

    return {
      initialDurationInMs: clamp(
        parseDurationIfPossible(initialDuration) ?? defaultInitialDurationInMs,
        [minInitialDurationInMs, maxInitialDurationInMs],
      ),
      pauseDurationInMs: unclampedPauseDuration
        ? clamp(unclampedPauseDuration, [0, maxInitialDurationInMs])
        : undefined,
      targetTimestamp: parseDateIfPossible(targetDateTime),
    };
  }, [initialDuration, pauseDuration, targetDateTime]);

  const [timerState, setTimerState] = useState<TimerState>(externalTimerState);

  const prevExternalTimerState = useRef(externalTimerState);
  if (prevExternalTimerState.current !== externalTimerState) {
    prevExternalTimerState.current = externalTimerState;
    setTimerState(externalTimerState);
  }

  const startButtonRef = useRef<HTMLButtonElement>(null);
  const pauseButtonRef = useRef<HTMLButtonElement>(null);

  const applyTimerState = useCallback(
    (newTimerState: TimerState) => {
      setTimerState(newTimerState);

      if (newTimerState.pauseDurationInMs) {
        startButtonRef.current?.focus();
      } else {
        pauseButtonRef.current?.focus();
      }

      const properties = {
        [propertyIds.totalDuration]: duration.toString(
          normalizeDurationMinutesAndSeconds(
            duration.toString(newTimerState.initialDurationInMs),
          ),
        ),
        [propertyIds.progress]: {
          ...(newTimerState.pauseDurationInMs
            ? {
                [propertyIds.pauseDuration]: duration
                  .toString(
                    normalizeDurationMinutesAndSeconds(
                      newTimerState.pauseDurationInMs,
                    ),
                  )
                  .replace(/,/g, "."), // https://github.com/dlevs/duration-fns/issues/26
              }
            : {}),
          ...(newTimerState.targetTimestamp
            ? {
                [propertyIds.targetDateTime]: new Date(
                  newTimerState.targetTimestamp,
                ).toISOString(),
              }
            : {}),
        },
      };

      if (readonly) {
        return;
      }

      void graphModule.updateEntity({
        data: {
          entityId,
          entityTypeId,
          properties,
        },
      });
    },
    [entityId, entityTypeId, graphModule, readonly],
  );

  const remainingDurationInMs =
    timerState.pauseDurationInMs ??
    (timerState.targetTimestamp
      ? timerState.targetTimestamp - new Date().valueOf()
      : timerState.initialDurationInMs);

  const remainingProportion = Math.max(
    0,
    Math.min(1, remainingDurationInMs / timerState.initialDurationInMs),
  );

  const timerStatus: TimerStatus = timerState.pauseDurationInMs
    ? "paused"
    : !timerState.targetTimestamp
      ? "idle"
      : remainingDurationInMs > 0
        ? "running"
        : "finished";

  useAutoRefresh(timerStatus === "running");

  const handleReset = () => {
    applyTimerState({
      initialDurationInMs: timerState.initialDurationInMs,
    });
  };

  const handlePlayClick = () => {
    applyTimerState({
      initialDurationInMs: timerState.initialDurationInMs,
      targetTimestamp: duration
        .apply(
          new Date(),
          timerState.pauseDurationInMs ?? timerState.initialDurationInMs,
        )
        .valueOf(),
    });
  };

  const handlePauseClick = () => {
    if (
      !timerState.targetTimestamp ||
      timerState.targetTimestamp < new Date().valueOf()
    ) {
      return;
    }

    applyTimerState({
      initialDurationInMs: timerState.initialDurationInMs,
      pauseDurationInMs: duration.toMilliseconds(
        duration.between(new Date(), timerState.targetTimestamp),
      ),
    });
  };

  const displayedDurationInMs =
    timerStatus === "finished"
      ? timerState.initialDurationInMs
      : Math.floor(remainingDurationInMs / 1000) * 1000;

  const handleLessOrMoreTimeButtonClick: MouseEventHandler = (event) => {
    const step = event.currentTarget.classList.contains("less-time-button")
      ? -1
      : 1;

    const stepLength = calculateDurationStepLength(
      displayedDurationInMs +
        step /* pick sides around edge values like 10 seconds */,
    );

    const roundUpOrDown = step > 0 ? Math.floor : Math.ceil;
    const newDurationInMs = clamp(
      roundUpOrDown((displayedDurationInMs + stepLength * step) / stepLength) *
        stepLength,
      [minInitialDurationInMs, maxInitialDurationInMs],
    );

    if (newDurationInMs !== displayedDurationInMs) {
      applyTimerState({
        initialDurationInMs: newDurationInMs,
      });
    }
  };

  const handleDurationInputChange = (valueInMs: number): void => {
    applyTimerState({
      initialDurationInMs: clamp(valueInMs, [
        minInitialDurationInMs,
        maxInitialDurationInMs,
      ]),
    });
  };

  return (
    <div ref={blockRef} className="timer-block">
      <div className="dial">
        <div className="dial-ring">
          <div
            className="dial-ring-completion"
            style={{ animationDelay: `-${(1 - remainingProportion) * 100}s` }}
          />
        </div>
        <div className="duration-container">
          <DurationInput
            value={displayedDurationInMs}
            disabled={!!readonly || timerStatus === "running"}
            onChange={handleDurationInputChange}
            onSubmit={handlePlayClick}
          />
        </div>
        {timerStatus === "running" ? (
          <button
            type="button"
            aria-label="pause"
            ref={pauseButtonRef}
            className="big-button big-button_type_pause"
            onClick={handlePauseClick}
            disabled={readonly}
          >
            <span className="big-button__icon" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="start"
            ref={startButtonRef}
            className="big-button big-button_type_play"
            onClick={handlePlayClick}
            disabled={readonly}
          >
            <span className="big-button__icon" />
          </button>
        )}
      </div>
      <div className="button-row">
        <button
          aria-label="Less time"
          className="less-time-button"
          disabled={
            !!readonly ||
            timerStatus === "running" ||
            displayedDurationInMs <= minInitialDurationInMs
          }
          onClick={handleLessOrMoreTimeButtonClick}
          type="button"
        />
        <button
          aria-label="Reset"
          className="reset-button"
          onClick={handleReset}
          disabled={
            !!readonly || timerStatus === "idle" || timerStatus === "finished"
          }
          type="button"
        />
        <button
          aria-label="More time"
          className="more-time-button"
          disabled={
            !!readonly ||
            timerStatus === "running" ||
            displayedDurationInMs >= maxInitialDurationInMs
          }
          onClick={handleLessOrMoreTimeButtonClick}
          type="button"
        />
      </div>
    </div>
  );
};
