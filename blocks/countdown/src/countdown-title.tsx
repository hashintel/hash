import type { ChangeEvent, FunctionComponent } from "react";
import { useEffect, useRef } from "react";

type CountdownTitleProps = {
  value: string | undefined;
  onChangeText: (val: string) => void;
  onBlur: () => void;
  readonly: boolean;
};

export const CountdownTitle: FunctionComponent<CountdownTitleProps> = ({
  value,
  onChangeText,
  onBlur,
  readonly,
}) => {
  const textareaEl = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const textarea = textareaEl.current;
    if (!textarea) return;

    // We only want to set textContent when the value changes externally because
    // by setting it we lose the cursor position in some browsers (firefox, safari)
    if (value !== textarea.textContent) {
      textarea.textContent = value ?? "";
    }
  }, [value]);

  const handleChange = (evt: ChangeEvent<HTMLDivElement>) => {
    if (!textareaEl.current) return;

    onChangeText(evt.currentTarget.textContent ?? "");
  };

  return (
    <div className="countdown-title">
      <div
        ref={textareaEl}
        className="title-input"
        // @ts-expect-error -- placeholder has been implemented as attr(placeholder) in CSS class
        placeholder="Event name"
        onInput={handleChange}
        onBlur={onBlur}
        {...(!readonly && {
          role: "textbox",
          contentEditable: "true",
          onKeyDown: ({ key }) => {
            if (key === "Enter" || key === "Escape") {
              textareaEl.current?.blur();
            }
          },
        })}
      />
      {!readonly && (
        <button aria-label="Stop editing" onClick={onBlur} type="button">
          <svg
            width="20"
            height="20"
            viewBox="0 0 17 17"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M15.5 4.5C15.5 4.78125 15.375 5.03125 15.1875 5.21875L7.1875 13.2188C7 13.4062 6.75 13.5 6.5 13.5C6.21875 13.5 5.96875 13.4062 5.78125 13.2188L1.78125 9.21875C1.59375 9.03125 1.5 8.78125 1.5 8.5C1.5 7.9375 1.9375 7.5 2.5 7.5C2.75 7.5 3 7.625 3.1875 7.8125L6.5 11.0938L13.7812 3.8125C13.9688 3.625 14.2188 3.5 14.5 3.5C15.0312 3.5 15.5 3.9375 15.5 4.5Z"
              fill="currentColor"
            />
          </svg>
        </button>
      )}
    </div>
  );
};
