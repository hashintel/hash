export const formInputSizes = ["xxs", "xs", "sm", "md", "lg"] as const;
export type FormInputSize = (typeof formInputSizes)[number];
export type Tone = "neutral" | "brand" | "error" | "warning" | "success";

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
  inputRef?: React.Ref<Element>;
  /** Set to true to make the element focused on mount or 'never' to prevent the item being auto-focused */
  autoFocus?: boolean | "never";
} & SharedInputAndFieldProps;

/**
 * Resolve the DOM props implied by the shared `autoFocus` prop.
 *
 * `'never'` emits `data-no-autofocus` so focus-management (e.g. a containing
 * dialog/popover) skips this element when choosing what to focus on mount, and
 * never sets the native `autoFocus`.
 */
export const resolveAutoFocusProps = (
  autoFocus?: boolean | "never",
): { autoFocus?: true; "data-no-autofocus"?: "" } => ({
  autoFocus: autoFocus === true ? true : undefined,
  "data-no-autofocus": autoFocus === "never" ? "" : undefined,
});

/**
 * A single printable key that a number input will reject: letters and other
 * symbols are silently dropped by the browser, and integer inputs
 * additionally reject decimal/exponent characters. Non-integer inputs allow
 * every locale's decimal separator (period, comma, Arabic decimal separator
 * U+066B) — which one the browser honours depends on its locale, and any it
 * doesn't honour it drops silently itself. Modifier chords and non-printable
 * keys are never rejected.
 */
export const isRejectedNumberInputKey = (
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">,
  integer: boolean,
): boolean => {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.key.length !== 1
  ) {
    return false;
  }
  return integer ? !/[\d-]/.test(event.key) : !/[\d.,٫eE+-]/.test(event.key);
};

/**
 * Briefly flashes an input's background light grey to signal a rejected
 * character. The single from-keyframe animates back to the element's own
 * background (whatever that is), restarts cleanly on rapid repeats, and
 * no-ops where the Web Animations API is unavailable (e.g. jsdom).
 */
export const flashInvalidInput = (input: Element) => {
  if (typeof input.animate !== "function") {
    return;
  }
  input.animate(
    [{ backgroundColor: "var(--colors-neutral-s25, #f4f4f4)", offset: 0 }],
    { duration: 300, easing: "ease-out" },
  );
};

/**
 * There is no standard for turning off autocomplete, so this includes the
 * properties that turn it off for the most popular browsers + password
 * managers. Spread onto an `<input>`.
 */
export const preventAutocompleteProps = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-protonpass-ignore": "true",
  "data-bwignore": "1",
} as const;
