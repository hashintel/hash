import React, {
  FC,
  forwardRef,
  HTMLAttributes,
  MutableRefObject,
  useRef,
} from "react";
import DatePicker, { ReactDatePickerProps } from "react-datepicker";

const CalenderIcon: FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    <svg
      width="17"
      height="16"
      viewBox="0 0 17 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      onClick={onClick}
    >
      <g opacity="0.5">
        <path
          d="M6.25 2H10.75V0.75C10.75 0.34375 11.0625 0 11.5 0C11.9062 0 12.25 0.34375 12.25 0.75V2H13.5C14.5938 2 15.5 2.90625 15.5 4V14C15.5 15.125 14.5938 16 13.5 16H3.5C2.375 16 1.5 15.125 1.5 14V4C1.5 2.90625 2.375 2 3.5 2H4.75V0.75C4.75 0.34375 5.0625 0 5.5 0C5.90625 0 6.25 0.34375 6.25 0.75V2ZM3 14C3 14.2812 3.21875 14.5 3.5 14.5H13.5C13.75 14.5 14 14.2812 14 14V6H3V14Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
};

const CustomInput = forwardRef<
  HTMLInputElement,
  HTMLAttributes<HTMLInputElement>
>(({ ...props }, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        type="text"
        ref={(element) => {
          if (!ref || !inputRef) return;

          (inputRef as MutableRefObject<HTMLInputElement | null>).current =
            element;
          if (typeof ref === "function") {
            ref(element);
          } else {
            // eslint-disable-next-line no-param-reassign
            ref.current = element;
          }
        }}
        {...props}
      />
      <CalenderIcon onClick={() => inputRef.current?.focus()} />
    </>
  );
});

type CustomTimeInputProps = {
  onChange?: (val: string) => void;
  displayTime: boolean;
  setDisplayTime: (val: boolean) => void;
} & Omit<HTMLAttributes<HTMLInputElement>, "onChange">;

const CustomTimeInput = forwardRef<HTMLInputElement, CustomTimeInputProps>(
  ({ displayTime, setDisplayTime, ...props }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);

    if (!displayTime) {
      return (
        <button
          className="react-datepicker-time__btn"
          type="button"
          onClick={() => setDisplayTime(true)}
        >
          Add time +
        </button>
      );
    }

    return (
      <>
        <input
          ref={(element) => {
            if (!ref || !inputRef) return;

            (inputRef as MutableRefObject<HTMLInputElement | null>).current =
              element;
            if (typeof ref === "function") {
              ref(element);
            } else {
              // eslint-disable-next-line no-param-reassign
              ref.current = element;
            }
          }}
          type="time"
          className="react-datepicker-time__input"
          placeholder="Time"
          name="time-input"
          required
          {...props}
          onChange={(evt) => {
            props.onChange?.(evt.target.value || "00:00");
          }}
        />
        <button
          className="react-datepicker-time__btn react-datepicker-time__btn--remove"
          type="button"
          onClick={() => setDisplayTime(false)}
        >
          Hide time
        </button>
      </>
    );
  },
);

type DatePickerInputProps = {
  displayTime: boolean;
  setDisplayTime: (val: boolean) => void;
} & ReactDatePickerProps<never, boolean>;

export const DatePickerInput = forwardRef<DatePicker, DatePickerInputProps>(
  ({ displayTime, setDisplayTime, ...props }, ref) => {
    return (
      <div>
        <DatePicker
          ref={ref}
          placeholderText="Select a date"
          showWeekNumbers
          dateFormat={displayTime ? "Pp" : "P"}
          {...props}
          customInput={<CustomInput />}
          customTimeInput={
            <CustomTimeInput
              displayTime={displayTime}
              setDisplayTime={setDisplayTime}
            />
          }
          showTimeInput
        />
      </div>
    );
  },
);
