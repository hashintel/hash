import React, { forwardRef } from "react";
import DatePicker, { ReactDatePickerProps } from "react-datepicker";

const CustomInput = forwardRef<HTMLInputElement>(({ ...props }, ref) => {
  return (
    <>
      <input type="text" ref={ref} {...props} />
      <svg
        width="17"
        height="16"
        viewBox="0 0 17 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        onClick={props.onFocus}
      >
        <g opacity="0.5">
          <path
            d="M6.25 2H10.75V0.75C10.75 0.34375 11.0625 0 11.5 0C11.9062 0 12.25 0.34375 12.25 0.75V2H13.5C14.5938 2 15.5 2.90625 15.5 4V14C15.5 15.125 14.5938 16 13.5 16H3.5C2.375 16 1.5 15.125 1.5 14V4C1.5 2.90625 2.375 2 3.5 2H4.75V0.75C4.75 0.34375 5.0625 0 5.5 0C5.90625 0 6.25 0.34375 6.25 0.75V2ZM3 14C3 14.2812 3.21875 14.5 3.5 14.5H13.5C13.75 14.5 14 14.2812 14 14V6H3V14Z"
            fill="#758AA1"
          />
        </g>
      </svg>
    </>
  );
});

export const DatePickerInput = forwardRef<
  DatePicker,
  ReactDatePickerProps<never, boolean>
>((props, ref) => {
  return (
    <div>
      <DatePicker ref={ref} {...props} customInput={<CustomInput />} />
    </div>
  );
});
