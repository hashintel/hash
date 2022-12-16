import { FunctionComponent } from "react";
import Cross from "../svgs/cross";

type ImageErrorAlertProps = { error: string | null; onClearError: () => void };

export const ErrorAlert: FunctionComponent<ImageErrorAlertProps> = ({
  error,
  onClearError,
}) => (
  <div
    style={{
      position: "relative",
      paddingTop: "0.75rem",
      paddingBottom: "0.75rem",
      paddingLeft: "1rem",
      paddingRight: "1rem",
      marginLeft: "auto",
      marginRight: "auto",
      marginBottom: "1rem",
      backgroundColor: "#FEE2E2",
      color: "#B91C1C",
      width: "24rem",
      borderRadius: "0.25rem",
      borderWidth: "1px",
      borderColor: "#F87171",
      borderStyle: "solid",
    }}
    role="alert"
  >
    <div style={{ marginRight: "1.25rem" }}>
      <strong style={{ fontWeight: "700" }}>Error</strong>
      <span className={tw`block sm:inline ml-2 `}>{error}</span>
    </div>

    <button
      type="button"
      onClick={onClearError}
      className={tw`absolute top-0 bottom-0 right-0 px-4 py-3 border-0 focus:outline-none bg-transparent box-border cursor-pointer`}
    >
      <Cross />
    </button>
  </div>
);
