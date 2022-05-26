import * as duration from "duration-fns";
import React, {
  ChangeEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  useCallback,
  useMemo,
  useRef,
  useState,
  VoidFunctionComponent,
} from "react";

type DurationInputProps = {
  value: duration.Duration;
  disabled: boolean;
  onChange: (newValue: duration.Duration) => void;
  onSubmit: () => void;
};

type InputTexts = [string, string];
type InputTextIndex = 0 | 1;

const extractInputIndex = (element: HTMLInputElement): InputTextIndex => {
  const result = Number.parseInt(element.dataset.index!, 10);

  if (result !== 0 && result !== 1) {
    throw new Error(`Unexpected input index ${result}`);
  }

  return result;
};

const findInputByIndex = (
  container: HTMLDivElement | null,
  inputIndex: number,
): HTMLInputElement | undefined => {
  return (
    container?.querySelector<HTMLInputElement>(
      `input[data-index="${inputIndex}"]`,
    ) ?? undefined
  );
};

const padDigits = (value: number): string => `${value}`.padStart(2, "0");

const convertDurationToInputTexts = (value: duration.Duration): InputTexts => {
  return [padDigits(value.minutes), padDigits(value.seconds)];
};

const convertInputTextsToDurationInMs = (
  inputTexts: InputTexts,
): number | undefined => {
  const minutes = Number.parseInt(inputTexts[0] ?? "0", 10);
  const seconds = Number.parseInt(inputTexts[1] ?? "0", 10);
  if (
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > 59 ||
    minutes < 0 ||
    minutes > 99 ||
    (seconds === 0 && minutes === 0)
  ) {
    return undefined;
  }

  return minutes * 60_000 + seconds * 1000;
};

export const DurationInput: VoidFunctionComponent<DurationInputProps> = ({
  value,
  disabled,
  onChange,
  onSubmit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const valueInMs = useMemo(() => duration.toMilliseconds(value), [value]);
  const previousValueInMsRef = useRef(valueInMs);

  const normalizedInputTexts = useMemo(
    () => convertDurationToInputTexts(value),
    [value],
  );
  const [userInputTexts, setUserInputTexts] = useState(normalizedInputTexts);

  const userValueInMs = useMemo(
    () => convertInputTextsToDurationInMs(userInputTexts),
    [userInputTexts],
  );

  if (previousValueInMsRef.current !== valueInMs) {
    previousValueInMsRef.current = valueInMs;
    setUserInputTexts(normalizedInputTexts);
  }

  const handleInputChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      const inputIndex = extractInputIndex(event.currentTarget);
      const sanitizedValue = event.target.value
        .split("")
        .filter((char) => char >= "0" && char <= "9")
        .slice(-2)
        .join("");

      const newInputTexts = [...userInputTexts] as InputTexts;
      newInputTexts[inputIndex] = sanitizedValue;
      setUserInputTexts(newInputTexts);
    },
    [userInputTexts],
  );

  const handleInputKeyDown = useCallback<
    KeyboardEventHandler<HTMLInputElement>
  >(
    (event) => {
      const inputIndex = extractInputIndex(event.currentTarget);

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const step =
          (event.key === "ArrowUp" ? 1 : -1) *
          (inputIndex === 1 ? 1000 : 60000);

        onChange(duration.parse(valueInMs + step));
        event.preventDefault();
        return;
      }

      let inputToJumpTo: HTMLInputElement | undefined = undefined;

      if (
        event.key === "ArrowLeft" &&
        event.currentTarget.selectionEnd ===
          event.currentTarget.selectionStart &&
        event.currentTarget.selectionStart === 0
      ) {
        inputToJumpTo = findInputByIndex(containerRef.current, inputIndex - 1);
      }

      if (
        event.key === "ArrowRight" &&
        event.currentTarget.selectionEnd ===
          event.currentTarget.selectionStart &&
        event.currentTarget.selectionEnd === event.currentTarget.value.length
      ) {
        inputToJumpTo = findInputByIndex(containerRef.current, inputIndex + 1);
      }

      if (inputToJumpTo) {
        inputToJumpTo.setSelectionRange(0, inputToJumpTo.value.length);
        inputToJumpTo.focus();
        event.preventDefault();
        return;
      }

      if (event.key === "Enter") {
        setTimeout(() => {
          onSubmit();
        }, 50);
      }
    },
    [onChange, onSubmit, valueInMs],
  );

  const handleInputBlur = useCallback<FocusEventHandler>(() => {
    const newDurationInMs = convertInputTextsToDurationInMs(userInputTexts);
    if (newDurationInMs === undefined) {
      setUserInputTexts(normalizedInputTexts);
    } else {
      onChange(duration.parse(newDurationInMs));
    }
  }, [normalizedInputTexts, onChange, userInputTexts]);

  return (
    <div
      ref={containerRef}
      className={[
        "duration",
        disabled ? "" : "duration_status_enabled",
        userValueInMs === undefined ? "duration_value_invalid" : "",
      ].join(" ")}
    >
      <input
        data-index={0}
        disabled={disabled}
        onBlur={handleInputBlur}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        tabIndex={disabled ? -1 : undefined}
        value={userInputTexts[0]}
      />
      <span>:</span>
      <input
        data-index={1}
        disabled={disabled}
        onBlur={handleInputBlur}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        tabIndex={disabled ? -1 : undefined}
        value={userInputTexts[1]}
      />
    </div>
  );
};
