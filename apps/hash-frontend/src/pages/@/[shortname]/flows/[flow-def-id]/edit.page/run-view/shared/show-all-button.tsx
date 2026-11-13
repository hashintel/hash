import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const button = css({ alignSelf: "flex-start" });

/** Ends a list that shows only its first values, in the panel and in the column alike. */
export const ShowAllButton = ({
  count,
  noun,
  onClick,
}: {
  count: number;
  /** What the list holds, e.g. "Suppliers"; without it, "Show all N". */
  noun?: string;
  onClick: () => void;
}) => (
  <Button variant="ghost" size="xs" className={button} onClick={onClick}>
    {noun ? `Show all ${count} ${noun}` : `Show all ${count}`}
  </Button>
);
