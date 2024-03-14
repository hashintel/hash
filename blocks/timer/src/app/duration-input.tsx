import type {
  ChangeEventHandler,
  FocusEventHandler,
  FunctionComponent,
  KeyboardEventHandler,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { clamp } from "./clamp";

type DurationInputProps = {
  /** milliseconds */
  value: number;
  disabled: boolean;
  /** @param newValue milliseconds */
  onChange: (newValue: number) => void;
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

const convertDurationInMsToInputTexts = (value: number): InputTexts => {
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor(value / 1000) % 60;
  return [padDigits(minutes), padDigits(seconds)];
};

const convertInputTextsToDurationInMs = (inputTexts: InputTexts): number => {
  const minutes = Number.parseInt(inputTexts[0] || "0", 10) || 0;
  const seconds = Number.parseInt(inputTexts[1] || "0", 10) || 0;

  return clamp(minutes, [0, 99]) * 60_000 + clamp(seconds, [0, 59]) * 1000;
};

export const DurationInput: FunctionComponent<DurationInputProps> = ({
  value,
  disabled,
  onChange,
  onSubmit,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousValueRef = useRef(value);

  const normalizedInputTexts = useMemo(
    () => convertDurationInMsToInputTexts(value),
    [value],
  );
  const [userInputTexts, setUserInputTexts] = useState(normalizedInputTexts);

  if (previousValueRef.current !== value) {
    previousValueRef.current = value;
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

  // onSubmit is called inside setTimeout. If this prop changes between re-renders,
  // we might end up with stale values in the closure. So calling a ref instead.
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  const handleInputKeyDown = useCallback<
    KeyboardEventHandler<HTMLInputElement>
  >(
    (event) => {
      const inputIndex = extractInputIndex(event.currentTarget);

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const step =
          (event.key === "ArrowUp" ? 1 : -1) *
          (inputIndex === 1 ? 1000 : 60000);

        onChange(value + step);
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
        event.currentTarget.blur(); // commit value
        setTimeout(() => {
          onSubmitRef.current();
        }, 50);
      }
    },
    [onChange, value],
  );

  const handleInputBlur = useCallback<FocusEventHandler>(() => {
    if (userInputTexts === normalizedInputTexts) {
      return;
    }
    const newDurationInMs = convertInputTextsToDurationInMs(userInputTexts);
    onChange(newDurationInMs);
    setUserInputTexts(normalizedInputTexts);
  }, [normalizedInputTexts, onChange, userInputTexts]);

  return (
    <div
      ref={containerRef}
      className={["duration", disabled ? "" : "duration_status_enabled"].join(
        " ",
      )}
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
