import type { FormInputWidth, SharedInputProps } from "../../util/form-shared";
import type { IconName } from "../Icon/icon";

export const BaseInput = (
  props: {
    /** The html type of the input element (text/number etc) */
    type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
    /** The keyboard that should be used on mobile devices. */
    inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
    /** An optional placeholder for the input */
    placeholder?: string;
    /** Disable editing of the input. Unlike disabled this strips the input styles and displays the value as text */
    readonly?: boolean;
    /** Whether the input is in a loading state */
    loading?: boolean;
    /** subtle inputs have no border and display similarly to inline text */
    variant?: "default" | "subtle";
    /** set the alignment of the text in the input */
    align?: "left" | "center" | "right";
    /** A set of standard widths to choose for the input. You can also set the width with css when aligning with other inputs is not required. */
    width?: FormInputWidth;
    /** Optional element or button to include at the beginning of an input */
    prefix?:
      | { iconName: IconName; onClick?: () => void }
      | { text: string; onClick?: () => void }
      | React.ReactNode;
    /** Optional element or button to include at the end of an input */
    suffix?:
      | { iconName: IconName; onClick?: () => void }
      | { text: string; onClick?: () => void }
      | React.ReactNode;
    /** A customized view that is shown when the input is unfocused. Can be used to present the value with extra formatting */
    styledValue?: React.ReactNode;
    /** Set to allow the input to be cleared. As the component is controlled you must clear the value manually with onClear. */
    clearable?: {
      clearable: boolean;
      onClear: () => void;
    };
    onClick?: React.MouseEventHandler<Element>;
    onKeyDown?: React.KeyboardEventHandler<Element>;
    min?: number;
    max?: number;
    step?: number;
    maxLength?: number;
    pattern?: string;
    spellcheck?: boolean;
    /** Set to prevent browsers from autocompleting input fields */
    autocomplete?: false;
  } & SharedInputProps<
    HTMLInputElement,
    string | null | undefined,
    (
      value: string,
      event: React.InputHTMLAttributes<HTMLInputElement>["onChange"],
    ) => void
  > &
    React.AriaAttributes,
) => {
  return <input {...props} />;
};
