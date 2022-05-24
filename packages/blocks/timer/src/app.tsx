import "./app.scss";

import React, { useEffect, useState, useCallback } from "react";
import { BlockComponent } from "blockprotocol/react";
import { parseISO } from "date-fns";
import * as duration from "duration-fns";
import { useAutoRefresh } from "./use-auto-refresh";

type TimerState = {
  /** https://schema.org/Duration */
  initialDuration: string;
  /** https://schema.org/Duration */
  pauseDuration?: string;
  /** https://schema.org/DateTime */
  targetDateTime?: string;
};

type DerivedStatus = "idle" | "running" | "paused" | "finished";

const punctuationSpace = "\u2008"; // same width as :

const isInPast = (date: Date): boolean => date < new Date();

export const App: BlockComponent<TimerState> = ({
  updateEntities,
  entityId,
  accountId,
  ...rest
}) => {
  const [timerState, setTimerState] = useState<TimerState>({
    initialDuration: rest.initialDuration,
    pauseDuration: rest.pauseDuration,
    targetDateTime: rest.targetDateTime,
  });

  useEffect(() => {
    setTimerState({
      initialDuration: rest.initialDuration,
      pauseDuration: rest.pauseDuration,
      targetDateTime: rest.targetDateTime,
    });
  }, [rest.initialDuration, rest.pauseDuration, rest.targetDateTime]);

  const applyTimerState = useCallback(
    (newTimerState: TimerState) => {
      setTimerState(newTimerState);
      void updateEntities?.([{ entityId, accountId, data: newTimerState }]);
    },
    [accountId, entityId, updateEntities],
  );

  const parsedTargetDateTime = timerState.targetDateTime
    ? parseISO(timerState.targetDateTime)
    : undefined;

  const parsedInitialDuration = duration.parse(timerState.initialDuration);
  const parsedPauseDuration = timerState.pauseDuration
    ? duration.parse(timerState.pauseDuration)
    : undefined;

  const remainingDuration =
    parsedPauseDuration ??
    (parsedTargetDateTime
      ? duration.between(new Date(), parsedTargetDateTime)
      : parsedInitialDuration);

  const initialDurationInMs = duration.toMilliseconds(parsedInitialDuration);
  const remainingDurationInMs = duration.toMilliseconds(remainingDuration);
  const remainingProportion = Math.max(
    0,
    Math.min(1, 1 - remainingDurationInMs / initialDurationInMs),
  );

  const derivedStatus: DerivedStatus = parsedPauseDuration
    ? "paused"
    : !parsedTargetDateTime
    ? "idle"
    : remainingDurationInMs > 0
    ? "running"
    : "finished";

  const handleReset = () => {
    applyTimerState({ initialDuration: timerState.initialDuration });
  };

  const handlePlayClick = () => {
    applyTimerState({
      initialDuration: timerState.initialDuration,
      targetDateTime: duration
        .apply(new Date(), parsedInitialDuration)
        .toISOString(),
    });
  };

  const handlePauseClick = () => {
    if (!parsedTargetDateTime || isInPast(parsedTargetDateTime)) {
      return;
    }

    applyTimerState({
      initialDuration: timerState.initialDuration,
      pauseDuration: timerState.pauseDuration,
    });
  };

  useAutoRefresh(derivedStatus === "running");

  const countdownValue =
    `${remainingDuration.minutes ?? 0}`.padStart(2, "0") +
    (remainingDurationInMs % 1000 < 500 ? ":" : punctuationSpace) +
    `${remainingDuration.seconds ?? 0}`.padStart(2, "0");

  return (
    <div className="timer-block">
      <div className="dial">
        <div className="dial-ring">
          <div
            className="dial-ring-completion"
            style={{ animationDelay: `-${remainingProportion * 100}s` }}
          />
        </div>
        <input className="countdown" value={countdownValue} disabled />
        {derivedStatus === "running" ? (
          <button
            type="button"
            aria-label="pause"
            className="pause-button"
            onClick={handlePauseClick}
          >
            <span className="pause-button-icon" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="start"
            className="play-button"
            onClick={handlePlayClick}
          >
            <span className="play-button-icon" />
          </button>
        )}
      </div>
      <div className="button-row">
        <button
          type="button"
          aria-label="Less time"
          className="less-time-button"
          disabled={derivedStatus !== "idle"}
        />
        <button
          type="button"
          aria-label="Reset"
          className="reset-button"
          onClick={handleReset}
        />
        <button
          type="button"
          aria-label="More time"
          className="more-time-button"
          disabled={derivedStatus !== "idle"}
        />
      </div>
    </div>
  );
};
