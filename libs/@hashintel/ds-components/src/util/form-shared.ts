export const formInputSizes = ["xxs", "xs", "sm", "md", "lg"] as const;
export type FormInputSize = (typeof formInputSizes)[number];

export type FormInputWidth =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "fullWidth"
  | "fitContent";

export type SharedInputAndFieldProps = {
  /** Set to show the input as disabled */
  disabled?: boolean;
  /** Set to show the input as required */
  required?: boolean;
  /** The size (height) of the element */
  size?: FormInputSize;
};

// All input components should extend from these props
export type SharedInputProps<
  Element extends HTMLElement,
  Value,
  onChange = (value: Value) => void,
> = {
  className?: string;
  /** The name of the input */
  name?: string;
  /** The input value */
  value: Value;
  /** The onChange handler */
  onChange: onChange;
  /** The onFocus handler */
  onFocus?: React.FocusEventHandler<Element>;
  /** The onBlur handler */
  onBlur?: React.FocusEventHandler<Element>;
  /** Set to show the input as invalid */
  invalid?: boolean;
  /** An optional testId */
  testId?: string;
  /** An id to manually link a label to this input. Since <FormField> automatically sets this id, this is usually not required. */
  htmlForId?: string;
  /** The ref of the containing element. Use this for measurements/placement */
  ref?: React.Ref<HTMLElement>;
  /** The input ref - this could be different to the ref, which may be a containing element. Use this to access the internal input state and/or to set focus */
  inputRef?: React.Ref<HTMLInputElement>;
  /** Set to true to make the element focused on mount - set to never to prevent the element from ever being auto-focused */
  autoFocus?: true | "never";
} & SharedInputAndFieldProps;
