"use client";

import type { HTMLStyledProps } from "@hashintel/ds-helpers/jsx";
import { forwardRef } from "react";

import { AbsoluteCenter } from "../absolute-center/absolute-center";
import { Span } from "../span/span";
import { Spinner } from "../spinner/spinner";

export interface LoaderProps extends HTMLStyledProps<"span"> {
  /**
   * Whether the loader is visible
   * @default true
   */
  visible?: boolean | undefined;
  /**
   * The spinner to display when loading
   */
  spinner?: React.ReactNode | undefined;
  /**
   * The placement of the spinner
   * @default "start"
   */
  spinnerPlacement?: "start" | "end" | undefined;
  /**
   * The text to display when loading
   */
  text?: React.ReactNode | undefined;

  children?: React.ReactNode;
}

export const Loader = forwardRef<HTMLSpanElement, LoaderProps>((props, ref) => {
  const {
    spinner = (
      // @ts-expect-error - "inherit" is not a valid color token
      <Spinner size="inherit" borderWidth="0.125em" color="inherit" />
    ),
    spinnerPlacement = "start",
    children,
    text,
    visible = true,
    ...rest
  } = props;

  if (!visible) {
    return children;
  }

  if (text) {
    return (
      <Span ref={ref} display="contents" {...rest}>
        {spinnerPlacement === "start" && spinner}
        {text}
        {spinnerPlacement === "end" && spinner}
      </Span>
    );
  }

  if (spinner) {
    return (
      <Span ref={ref} display="contents" {...rest}>
        <AbsoluteCenter display="inline-flex">{spinner}</AbsoluteCenter>
        <Span visibility="hidden" display="contents">
          {children}
        </Span>
      </Span>
    );
  }

  return (
    <Span ref={ref} display="contents" {...rest}>
      {children}
    </Span>
  );
});
