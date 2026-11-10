import { useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { useSnackbar } from "../../../../../../../../components/hooks/use-snackbar";

const error = css({ display: "flex", alignItems: "flex-start", gap: "1.5" });
const indicator = css({
  display: "flex",
  flexShrink: "0",
  /* Centred on the first line. */
  mt: "0.5",
  color: "status.error.fg.muted",
});
const body = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  flex: "1",
  minWidth: "0",
});
const oneLine = css({
  textStyle: "sm",
  color: "fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const actions = css({
  display: "flex",
  gap: "3",
  textStyle: "xs",
  color: "fg.muted",
});
const details = css({
  m: "0",
  p: "2",
  maxHeight: "[240px]",
  overflow: "auto",
  borderRadius: "md",
  bg: "bg.subtle",
  textStyle: "xs",
  fontFamily: "mono",
  color: "fg.body",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});

/** A step's error: a red mark and its first line, then all of it on Show details, to read or copy. */
export const StepRunError = ({
  message,
  context,
}: {
  message: string;
  /** What the error is of, before its first line, e.g. "Item 3". */
  context?: string;
}) => {
  const { triggerSnackbar } = useSnackbar();
  const [open, setOpen] = useState(false);
  const [firstLine] = message.split("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      triggerSnackbar.success("Copied the error");
    } catch {
      triggerSnackbar.error("Couldn't copy the error");
    }
  };

  return (
    <div className={error}>
      <span className={indicator}>
        <Icon name="error" size="sm" alt="Error" />
      </span>
      <div className={body}>
        <span className={oneLine} title={firstLine}>
          {context ? `${context}: ${firstLine}` : firstLine}
        </span>
        {open && <pre className={details}>{message}</pre>}
        <span className={actions}>
          <Button
            variant="linkSubtle"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Hide details" : "Show details"}
          </Button>
          {open && (
            <Button
              variant="linkSubtle"
              onClick={() => {
                void copy();
              }}
            >
              Copy
            </Button>
          )}
        </span>
      </div>
    </div>
  );
};
