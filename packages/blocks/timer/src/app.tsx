import "./app.scss";

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  MouseEventHandler,
} from "react";
import { BlockComponent } from "blockprotocol/react";
import { parseISO } from "date-fns";
import * as duration from "duration-fns";
import { useAutoRefresh } from "./app/use-auto-refresh";
import { calculateDurationStepLength } from "./app/calculate-duration-step-length";

type TimerState = {
  /** https://schema.org/Duration */
  initialDuration: string;
  /** https://schema.org/Duration */
  pauseDuration?: string;
  /** https://schema.org/DateTime */
  targetDateTime?: string;
};

export type AppProps = TimerState;

type DerivedStatus = "idle" | "running" | "paused" | "finished";

const punctuationSpace = "\u2008"; // same width as :

const minInitialDurationInMs = 1000;
const maxInitialDurationInMs = 99 * 60 * 1000;

const isInPast = (date: Date): boolean => date < new Date();

const normalizeDurationMinutesAndSeconds = (
  durationInput: duration.DurationInput,
): duration.Duration => {
  const rawResult = duration.normalize(durationInput);
  return {
    ...rawResult,
    minutes: rawResult.minutes + rawResult.hours * 60,
    hours: 0,
  };
};

export const App: BlockComponent<TimerState> = ({
  updateEntities,
  entityId,
  accountId,
  ...rest
}) => {
  const externalTimerState = useMemo<TimerState>(
    () => ({
      initialDuration: rest.initialDuration,
      pauseDuration: rest.pauseDuration,
      targetDateTime: rest.targetDateTime,
    }),
    [rest.initialDuration, rest.pauseDuration, rest.targetDateTime],
  );

  const prevExternalTimerState = useRef(externalTimerState);
  prevExternalTimerState.current = externalTimerState;

  const [timerState, setTimerState] = useState<TimerState>(externalTimerState);

  if (prevExternalTimerState.current !== externalTimerState) {
    setTimerState(externalTimerState);
  }

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
      ? normalizeDurationMinutesAndSeconds(
          duration.between(new Date(), parsedTargetDateTime),
        )
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

  useAutoRefresh(derivedStatus === "running");

  const countdownDuration =
    derivedStatus === "finished" ? parsedInitialDuration : remainingDuration;

  const countdownValue =
    `${countdownDuration.minutes ?? 0}`.padStart(2, "0") +
    ("running" && remainingDurationInMs % 1000 >= 500
      ? punctuationSpace
      : ":") +
    `${countdownDuration.seconds ?? 0}`.padStart(2, "0");

  const handleReset = () => {
    applyTimerState({ initialDuration: timerState.initialDuration });
  };

  const handlePlayClick = () => {
    applyTimerState({
      initialDuration: timerState.initialDuration,
      targetDateTime: duration
        .apply(new Date(), parsedPauseDuration ?? parsedInitialDuration)
        .toISOString(),
    });
  };

  const handlePauseClick = () => {
    if (!parsedTargetDateTime || isInPast(parsedTargetDateTime)) {
      return;
    }

    applyTimerState({
      initialDuration: timerState.initialDuration,
      pauseDuration: duration
        .toString(
          normalizeDurationMinutesAndSeconds(
            duration.between(new Date(), parsedTargetDateTime),
          ),
        )
        .replace(/,/g, "."),
    });
  };

  const handleLessOrMoreTimeButtonClick: MouseEventHandler = (event) => {
    const step = event.currentTarget.classList.contains("less-time-button")
      ? -1
      : 1;

    const stepLength = calculateDurationStepLength(
      initialDurationInMs + step /* pick sides around edge values like 10s */,
    );

    const newDurationInMs =
      Math.round((initialDurationInMs + stepLength * step) / stepLength) *
      stepLength;

    if (
      newDurationInMs !== initialDurationInMs &&
      newDurationInMs >= minInitialDurationInMs &&
      newDurationInMs <= maxInitialDurationInMs
    ) {
      applyTimerState({
        initialDuration: duration.toString(
          normalizeDurationMinutesAndSeconds(newDurationInMs),
        ),
      });
    }
  };

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
          aria-label="Less time"
          className="less-time-button"
          disabled={
            derivedStatus === "running" ||
            derivedStatus === "paused" ||
            initialDurationInMs <= minInitialDurationInMs
          }
          onClick={handleLessOrMoreTimeButtonClick}
          type="button"
        />
        <button
          aria-label="Reset"
          className="reset-button"
          onClick={handleReset}
          disabled={derivedStatus === "idle" || derivedStatus === "finished"}
          type="button"
        />
        <button
          aria-label="More time"
          className="more-time-button"
          disabled={
            derivedStatus === "running" ||
            derivedStatus === "paused" ||
            initialDurationInMs >= maxInitialDurationInMs
          }
          onClick={handleLessOrMoreTimeButtonClick}
          type="button"
        />
      </div>
    </div>
  );
};
