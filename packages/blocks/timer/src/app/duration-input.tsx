import * as duration from "duration-fns";
import React, {
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  useCallback,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";
import { TimerStatus } from "./timer-status";

type DurationInputProps = {
  value: duration.Duration;
  timerStatus: TimerStatus;
  onChange: (newValue: duration.Duration) => void;
};

const parseUserValue = (userValue: string | undefined): number | undefined => {
  const cleanedValue = userValue?.replace(/\s/g, "");
  if (!cleanedValue) {
    return undefined;
  }

  {
    const [, minutes, seconds] =
      cleanedValue.match(/^(\d{1,2})[:.](\d{1,2})$/) ?? [];
    if (minutes && seconds) {
      return (
        (Number.parseInt(minutes, 10) * 60 + Number.parseInt(seconds, 10)) *
        1000
      );
    }
  }
  {
    const [, seconds] = cleanedValue.match(/^(\d{1,4})$/) ?? [];
    if (seconds) {
      return Number.parseInt(seconds, 10) * 1000;
    }
  }

  return undefined;
};

export const DurationInput: VoidFunctionComponent<DurationInputProps> = ({
  value,
  timerStatus,
  onChange,
}) => {
  const valueInMs = duration.toMilliseconds(value);
  const stringifiedValue = `${`${value.minutes ?? 0}`.padStart(2, "0")}:${`${
    value.seconds ?? 0
  }`.padStart(2, "0")}`;

  const [userValue, setUserValue] = useState<undefined | string>();

  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    setUserValue(event.target.value);
  };

  const userValueInMs = parseUserValue(userValue);

  const handleKeyDown = useCallback<KeyboardEventHandler>((event) => {
    if (event.key === "Enter") {
      inputRef.current?.blur();
    }
    if (event.key === "Escape") {
      setUserValue(undefined);
      setTimeout(() => {
        inputRef.current?.blur();
      }, 50);
    }
  }, []);

  const handleBlur = useCallback<FocusEventHandler>(() => {
    if (userValueInMs && valueInMs !== userValueInMs) {
      onChange(duration.parse(userValueInMs));
    }
    setUserValue(undefined);
  }, [onChange, userValueInMs, valueInMs]);

  return (
    <input
      ref={inputRef}
      className={`countdown ${
        typeof userValue === "string" && typeof userValueInMs === "undefined"
          ? "countdown_value_invalid"
          : ""
      }`}
      value={userValue ?? stringifiedValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      disabled={timerStatus === "running"}
    />
  );
};
