/**
 * For each's List field as the @ menu row that was picked (inbox field-item-source, option 3 "Value first", 13 Nov):
 * the source step's 32 px hue tile, "Entities · 20" on line one and the step's name on line two. A run shows the same
 * block read-only, with the failures after the count. `?itemsource=old` keeps the select with `Step › Output` and
 * hides the Item row unless `?full`.
 */
import { Icon, type IconName } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { suppliers } from "./run-history";
import { treeTileColor } from "./status-colors";

import type { StepInputSource } from "./engine";
import type { RefLook } from "./ref-path";

/** MOCK: how many items the list held in the flow's last run; only Find active suppliers has runs. */
export const lastRunCount = (source: StepInputSource | undefined) =>
  source?.kind === "step-output" && source.stepId === "findSuppliers"
    ? suppliers.length
    : undefined;

const blockStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  width: "[100%]",
  minWidth: "[0]",
  paddingY: "1.5",
  paddingLeft: "1.5",
  paddingRight: "2.5",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.solid",
  borderRadius: "lg",
  backgroundColor: "neutral.bgSolid.min",
  textAlign: "left",
  cursor: "pointer",
  _hover: { borderColor: "neutral.bd.strong" },
  _focusVisible: { outline: "[2px solid var(--flows-sel-border)]" },
  "& > svg": { color: "neutral.fg.muted", flexShrink: 0 },
  "&[data-read-only]": {
    paddingY: "0",
    paddingLeft: "0",
    paddingRight: "0",
    borderColor: "[transparent]",
    backgroundColor: "[transparent]",
    cursor: "default",
  },
});

const tileStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: "[32px]",
  height: "[32px]",
  borderRadius: "md",
  "& svg": { width: "[18px !important]", height: "[18px !important]" },
});

/** The lines take part in baseline alignment, so the row's label lines up with line one (the tile stays centred). */
const linesStyle = css({
  flex: "1",
  minWidth: "[0]",
  display: "flex",
  flexDirection: "column",
  alignSelf: "baseline",
});

const lineOneStyle = css({
  textStyle: "sm",
  lineHeight: "[20px]",
  color: "neutral.fg.heading",
  overflowWrap: "anywhere",
  "&[data-placeholder]": { color: "neutral.fg.muted" },
});

const countStyle = css({ color: "neutral.fg.muted" });

const lineTwoStyle = css({
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.muted",
  overflowWrap: "anywhere",
});

export const ListSourceBlock = ({
  look,
  count,
  failed,
  readOnly = false,
  onClick,
}: {
  /** The picked list, or null when none is picked yet. */
  look: RefLook | null;
  count?: number;
  /** A run's failed items, after the count. */
  failed?: number;
  readOnly?: boolean;
  onClick?: () => void;
}) => {
  const icon: IconName = look ? look.icon : "cube";
  const content = (
    <>
      <span
        className={tileStyle}
        style={
          look
            ? treeTileColor(look.icon)
            : {
                background: "var(--colors-neutral-bg-solid-surface-active)",
                color: "var(--colors-neutral-fg-muted)",
              }
        }
        aria-hidden
      >
        <Icon name={icon} size="sm" />
      </span>
      <span className={linesStyle}>
        <span className={lineOneStyle} data-placeholder={look ? undefined : ""}>
          {look ? (
            <>
              {look.output}
              {count === undefined ? null : (
                <span className={countStyle}>
                  {` · ${count}`}
                  {failed ? ` · ${failed} failed` : ""}
                </span>
              )}
            </>
          ) : (
            "Choose a list"
          )}
        </span>
        <span className={lineTwoStyle}>
          {look ? look.step : "A list from an earlier step"}
        </span>
      </span>
      {readOnly ? null : <Icon name="chevronDown" size="sm" />}
    </>
  );
  return readOnly ? (
    <span className={blockStyle} data-read-only="" data-list-source>
      {content}
    </span>
  ) : (
    <button type="button" className={blockStyle} onClick={onClick} data-list-source>
      {content}
    </button>
  );
};
