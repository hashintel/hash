"use client";

/* eslint-disable @typescript-eslint/no-use-before-define */

import { VisuallyHidden } from "@hashintel/ds-helpers/jsx";

import { Span } from "../span/span";

export interface DisplayValueProps<T> {
  /** The value to display */
  value?: T | null | undefined;
  /** Optional function to format the value before displaying */
  formatValue?: (value: NonNullable<T>) => string | null | undefined;
}

export const DisplayValue = <T,>(props: DisplayValueProps<T>) => {
  const { value, formatValue } = props;

  const formattedValue = isNotEmpty(value)
    ? (formatValue?.(value) ?? String(value))
    : null;

  if (formattedValue) {
    return formattedValue;
  }

  return (
    <>
      <Span color="fg.subtle" aria-hidden>
        —
      </Span>
      <VisuallyHidden>No value available</VisuallyHidden>
    </>
  );
};

const isString = (value: unknown): value is string => typeof value === "string";

const isNotEmpty = <T,>(
  value: T | null | undefined,
): value is NonNullable<T> => {
  if (value == null) {
    return false;
  }
  if (isString(value) || Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
};
