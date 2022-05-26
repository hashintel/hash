import "./app.scss";

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  MouseEventHandler,
} from "react";
import { BlockComponent } from "blockprotocol/react";
import { parseISO, isValid } from "date-fns";
import * as duration from "duration-fns";
import { useAutoRefresh } from "./app/use-auto-refresh";
import { calculateDurationStepLength } from "./app/calculate-duration-step-length";
import { DurationInput } from "./app/duration-input";
import { TimerStatus } from "./app/timer-status";

type TimerState = {
  /** https://en.wikipedia.org/wiki/ISO_8601#Durations */
  initialDuration: string;
  /** https://en.wikipedia.org/wiki/ISO_8601#Durations */
  pauseDuration?: string;
  /** https://en.wikipedia.org/wiki/ISO_8601 */
  targetDateTime?: string;
};

export type AppProps = TimerState;

const minInitialDurationInMs = 1000;
const maxInitialDurationInMs = 99 * 60 * 1000;

const defaultInitialDuration = duration.parse("PT5M");

const clampDurationInMs = (durationInMs: number): number => {
  return Math.min(
    maxInitialDurationInMs,
    Math.max(minInitialDurationInMs, durationInMs),
  );
};

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

const parseDurationIfPossible = (
  value: string | undefined,
): duration.Duration | undefined => {
  if (value) {
    try {
      return normalizeDurationMinutesAndSeconds(
        duration.parse(clampDurationInMs(duration.toMilliseconds(value))),
      );
    } catch {
      // noop
    }
  }

  return undefined;
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

  const [timerState, setTimerState] = useState<TimerState>(externalTimerState);

  const prevExternalTimerState = useRef(externalTimerState);
  if (prevExternalTimerState.current !== externalTimerState) {
    prevExternalTimerState.current = externalTimerState;
    setTimerState(externalTimerState);
  }

  const applyTimerState = useCallback(
    (newTimerState: TimerState) => {
      setTimerState(newTimerState);
      void updateEntities?.([
        {
          entityId,
          accountId,
          data: {
            pauseDuration: undefined, // Make sure old values are removed if present
            targetDateTime: undefined,
            ...newTimerState,
          },
        },
      ]);
    },
    [accountId, entityId, updateEntities],
  );

  let parsedTargetDateTime: Date | undefined = undefined;
  if (timerState.targetDateTime) {
    const candidateParsedTargetDateTime = parseISO(timerState.targetDateTime);
    if (isValid(candidateParsedTargetDateTime)) {
      parsedTargetDateTime = candidateParsedTargetDateTime;
    }
  }

  const parsedInitialDuration =
    parseDurationIfPossible(timerState.initialDuration) ??
    defaultInitialDuration;
  const parsedPauseDuration = parseDurationIfPossible(timerState.pauseDuration);

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
    Math.min(
      1,
      1 -
        remainingDurationInMs / duration.toMilliseconds(parsedInitialDuration),
    ),
  );

  const timerStatus: TimerStatus = parsedPauseDuration
    ? "paused"
    : !parsedTargetDateTime
    ? "idle"
    : remainingDurationInMs > 0
    ? "running"
    : "finished";

  useAutoRefresh(timerStatus === "running");

  const handleReset = () => {
    applyTimerState({
      initialDuration: duration.toString(parsedInitialDuration),
    });
  };

  const handlePlayClick = () => {
    applyTimerState({
      initialDuration: duration.toString(parsedInitialDuration),
      targetDateTime: duration
        .apply(new Date(), parsedPauseDuration ?? parsedInitialDuration)
        .toISOString(),
    });
  };

  const handlePauseClick = () => {
    if (!parsedTargetDateTime || parsedTargetDateTime < new Date()) {
      return;
    }

    applyTimerState({
      initialDuration: duration.toString(parsedInitialDuration),
      pauseDuration: duration
        .toString(
          normalizeDurationMinutesAndSeconds(
            duration.between(new Date(), parsedTargetDateTime),
          ),
        )
        .replace(/,/g, "."), // https://github.com/dlevs/duration-fns/issues/26
    });
  };

  const handleLessOrMoreTimeButtonClick: MouseEventHandler = (event) => {
    const step = event.currentTarget.classList.contains("less-time-button")
      ? -1
      : 1;

    const stepLength = calculateDurationStepLength(
      remainingDurationInMs +
        step /* pick sides around edge values like 10 seconds */,
    );

    const roundUpOrDown = step > 0 ? Math.floor : Math.ceil;
    const newDurationInMs = clampDurationInMs(
      roundUpOrDown((remainingDurationInMs + stepLength * step) / stepLength) *
        stepLength,
    );

    if (newDurationInMs !== remainingDurationInMs) {
      applyTimerState({
        initialDuration: duration.toString(
          normalizeDurationMinutesAndSeconds(newDurationInMs),
        ),
      });
    }
  };

  const handleDurationInputChange = (value: duration.Duration) => {
    const valueInMs = duration.toMilliseconds(value);
    const acceptedValue =
      valueInMs > maxInitialDurationInMs
        ? duration.parse(maxInitialDurationInMs)
        : valueInMs < minInitialDurationInMs
        ? duration.parse(minInitialDurationInMs)
        : value;

    applyTimerState({
      initialDuration: duration.toString(
        normalizeDurationMinutesAndSeconds(acceptedValue),
      ),
    });
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
        <DurationInput
          value={
            timerStatus === "finished"
              ? parsedInitialDuration
              : remainingDuration
          }
          disabled={timerStatus === "running"}
          onChange={handleDurationInputChange}
        />
        {timerStatus === "running" ? (
          <button
            type="button"
            aria-label="pause"
            className="big-button big-button_type_pause"
            onClick={handlePauseClick}
          >
            <span className="big-button__icon" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="start"
            className="big-button big-button_type_play"
            onClick={handlePlayClick}
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
            timerStatus === "running" ||
            initialDurationInMs <= minInitialDurationInMs
          }
          onClick={handleLessOrMoreTimeButtonClick}
          type="button"
        />
        <button
          aria-label="Reset"
          className="reset-button"
          onClick={handleReset}
          disabled={timerStatus === "idle" || timerStatus === "finished"}
          type="button"
        />
        <button
          aria-label="More time"
          className="more-time-button"
          disabled={
            timerStatus === "running" ||
            initialDurationInMs >= maxInitialDurationInMs
          }
          onClick={handleLessOrMoreTimeButtonClick}
          type="button"
        />
      </div>
    </div>
  );
};
