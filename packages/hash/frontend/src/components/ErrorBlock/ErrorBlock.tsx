import type { FallbackRender } from "@sentry/react/dist/errorboundary";
import React from "react";
import { tw } from "twind";
import { css } from "twind/css";

import { OldButton } from "../forms/OldButton";

/**
 * @todo make twind and other global styles available in iframes
 */
const styles = css({
  fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";`,
});

type FallbackRenderProps = Parameters<FallbackRender>[0];

export interface ErrorBlockProps extends FallbackRenderProps {
  onRetry(): void;
}

export const ErrorBlock: React.VFC<ErrorBlockProps> = ({ error, onRetry }) => (
  <div
    className={tw`flex flex-row items-baseline px-3 py-2 border-2 border-red-300 rounded`}
  >
    Error:{" "}
    <span className={tw`flex-grow truncate font-mono`}>{error.message}</span>
    <OldButton
      className={`${tw`whitespace-nowrap`} ${tw(styles)}`}
      onClick={onRetry}
    >
      Reload block
    </OldButton>
  </div>
);
