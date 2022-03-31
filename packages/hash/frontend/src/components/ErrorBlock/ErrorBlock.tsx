import type { FallbackRender } from "@sentry/react/dist/errorboundary";
import React from "react";
import { tw } from "twind";
import { Button } from "../../shared/ui";

/**
 * @todo make twind and other global styles available in iframes
 */

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
    <Button sx={{ whiteSpace: "nowrap" }} onClick={onRetry}>
      Reload block
    </Button>
  </div>
);
