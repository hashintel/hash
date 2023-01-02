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
    style={{
      alignItems: "baseline",
      borderColor: "#FCA5A5",
      borderRadius: "0.25rem",
      borderWidth: "2px",
      display: "flex",
      flexDirection: "row",
      paddingBottom: "0.5rem",
      paddingLeft: "0.75rem",
      paddingRight: "0.75rem",
      paddingTop: "0.5rem",
    }}
    contentEditable="false"
  >
    Error:{" "}
    <span
      style={{
        flexGrow: "1",
        fontFamily:
          'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {error.message}
    </span>
    <Button sx={{ whiteSpace: "nowrap" }} onClick={onRetry}>
      Reload block
    </Button>
  </div>
);
