import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { Button, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { useSnackbar } from "../../../../../../../../components/hooks/use-snackbar";
import { Link } from "../../../../../../../../shared/ui/link";
import { shortRunIdFont } from "../../shared/run-id";
import { RunGlyph } from "../../shared/run-marks";
import { runStates, runStateMarks } from "../../shared/run-state";

import type { RunState } from "../../shared/run-state";
import type { RunRow } from "../run-list";

const idCell = css({ display: "flex", alignItems: "center", gap: "1" });
const shortId = css({
  color: "fg.heading",
  _hover: { textDecoration: "underline" },
});
/* Shown while the ID's cell is hovered, or the button has focus. */
const copyButton = css({
  opacity: "0",
  _groupHover: { opacity: "1" },
  _focusVisible: { opacity: "1" },
});

/** The run's short ID, a link to the run, and a button that copies its full ID. */
export const IdCell = ({
  row,
  href,
}: {
  row: RunRow;
  /** Where the run opens. */
  href: string;
}) => {
  const { triggerSnackbar } = useSnackbar();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        extractEntityUuidFromEntityId(row.flowRunEntityId),
      );
      triggerSnackbar.success("Copied the run's ID");
    } catch {
      triggerSnackbar.error("Couldn't copy the run's ID");
    }
  };

  return (
    <div className={cx("group", idCell)}>
      <Link
        href={href}
        shallow
        noLinkStyle
        /* The row opens the run too. */
        onClick={(event) => event.stopPropagation()}
      >
        <span className={cx(shortRunIdFont, shortId)}>{row.shortId}</span>
      </Link>
      <span
        role="presentation"
        /* Copying doesn't open the run. */
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          size="xs"
          variant="ghost"
          tone="neutral"
          iconName="copy"
          tooltip="Copy run ID"
          className={copyButton}
          onClick={() => {
            void copy();
          }}
        />
      </span>
    </div>
  );
};

const statusCell = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  /* Centres a mark with no text beside it. */
  verticalAlign: "middle",
});
const statusText = css({ color: "fg.muted" });

/** The states whose name shows beside their mark: only where the mark alone says too little. */
const namedStates: RunState[] = ["needsReview", "cancelled", "unknown"];

export const StatusCell = ({ state }: { state: RunState }) => {
  const { label } = runStates[state];
  const mark = <RunGlyph state={runStateMarks[state]} label={label} />;

  return namedStates.includes(state) ? (
    <span className={statusCell}>
      {/* Its state is named beside it. */}
      <span aria-hidden>{mark}</span>
      <span className={statusText}>{label}</span>
    </span>
  ) : (
    <Tooltip content={label}>
      <span className={statusCell}>{mark}</span>
    </Tooltip>
  );
};
