import { Icon, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { planningWarningTexts } from "./procurement-planning-ui";

import type { PlanningWarning } from "./types";

const warningIcon = css({
  display: "inline-flex",
  flexShrink: "0",
  color: "status.warning.fg.body",
  cursor: "help",
  border: "0",
  appearance: "none",
  p: "0",
});

const warningList = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  textAlign: "left",
});

export const PlanningWarningIndicator = ({
  warnings,
}: {
  warnings?: PlanningWarning[] | null;
}) => {
  const texts = planningWarningTexts(warnings);
  if (texts.length === 0) {
    return null;
  }

  return (
    <Tooltip
      content={
        <span className={warningList}>
          {texts.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </span>
      }
      position="top"
      openDelay="fast"
    >
      <button
        type="button"
        className={warningIcon}
        aria-label={texts.join("; ")}
        onClick={(event) => event.stopPropagation()}
      >
        <Icon name="warning" size="xs" />
      </button>
    </Tooltip>
  );
};
