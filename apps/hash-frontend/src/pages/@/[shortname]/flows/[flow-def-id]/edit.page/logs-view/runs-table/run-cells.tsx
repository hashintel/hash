import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { Button, Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { useSnackbar } from "../../../../../../../../components/hooks/use-snackbar";
import { Link } from "../../../../../../../../shared/ui/link";
import { shortRunIdFont } from "../../shared/run-id";
import { runStates } from "../run-state";

import type { RunRow } from "../run-list";
import type { RunState } from "../run-state";
import type { IconName } from "@hashintel/ds-components";

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
});
const statusText = css({ color: "fg.muted" });

/** Each state's glyph, and whether its name shows beside it: only where the glyph alone says too little. */
const stateGlyphs: Record<
  RunState,
  { iconName: IconName; className: string; named: boolean }
> = {
  running: {
    iconName: "circleEllipsis",
    className: css({ color: "blue.s80" }),
    named: false,
  },
  needsReview: {
    iconName: "hand",
    className: css({ color: "orange.s80" }),
    named: true,
  },
  completed: {
    iconName: "circleCheck",
    className: css({ color: "green.s80" }),
    named: false,
  },
  failed: {
    iconName: "circleClose",
    className: css({ color: "red.s85" }),
    named: false,
  },
  timedOut: {
    iconName: "clock",
    className: css({ color: "red.s85" }),
    named: true,
  },
  cancelled: {
    iconName: "circleClose",
    className: css({ color: "neutral.s70" }),
    named: true,
  },
  unknown: {
    iconName: "circle",
    className: css({ color: "neutral.s70" }),
    named: true,
  },
};

export const StatusCell = ({ state }: { state: RunState }) => {
  const { iconName, className, named } = stateGlyphs[state];
  const { label } = runStates[state];

  return named ? (
    <span className={statusCell}>
      <Icon name={iconName} size="sm" className={className} />
      <span className={statusText}>{label}</span>
    </span>
  ) : (
    <Tooltip content={label}>
      <span className={statusCell}>
        <Icon name={iconName} size="sm" className={className} alt={label} />
      </span>
    </Tooltip>
  );
};
