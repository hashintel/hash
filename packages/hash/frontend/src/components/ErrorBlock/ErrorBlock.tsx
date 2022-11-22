import type { FallbackRender } from "@sentry/react";
import { FunctionComponent } from "react";
import { Button } from "../../shared/ui";

type FallbackRenderProps = Parameters<FallbackRender>[0];

export interface ErrorBlockProps extends FallbackRenderProps {
  onRetry(): void;
}

export const ErrorBlock: FunctionComponent<ErrorBlockProps> = ({
  error,
  onRetry,
}) => (
  <div
    style={tw`flex flex-row items-baseline px-3 py-2 border-2 border-red-300 rounded`}
    contentEditable="false"
  >
    Error: <span style={tw`flex-grow truncate font-mono`}>{error.message}</span>
    <Button sx={{ whiteSpace: "nowrap" }} onClick={onRetry}>
      Reload block
    </Button>
  </div>
);
