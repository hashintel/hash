import { useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { isLongText } from "./run-value-display";

const inlineValue = css({
  m: "0",
  textStyle: "sm",
  color: "fg.heading",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});
const longText = css({ display: "flex", flexDirection: "column", gap: "1" });
/* About half the lines long text takes up in the panel at the least. */
const cutShort = css({ lineClamp: "6" });
const quiet = css({ textStyle: "sm", color: "fg.subtle" });
const showMore = css({ alignSelf: "flex-start" });

/** A text value as it is. Long text shows only its start, with the rest on Show more. */
export const TextValue = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false);

  if (text === "") {
    return <p className={quiet}>Empty</p>;
  }

  if (!isLongText(text)) {
    return <p className={inlineValue}>{text}</p>;
  }

  return (
    <div className={longText}>
      <p className={cx(inlineValue, !open && cutShort)}>{text}</p>
      <Button
        variant="ghost"
        size="xs"
        className={showMore}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Show less" : "Show more"}
      </Button>
    </div>
  );
};
