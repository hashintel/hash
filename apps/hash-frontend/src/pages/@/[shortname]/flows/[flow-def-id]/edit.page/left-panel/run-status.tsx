import { css } from "@hashintel/ds-helpers/css";

import { RunGlyph } from "../shared/run-marks";

import type { StepRunMark } from "../shared/step-states";

const status = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flexShrink: "0",
});
const counts = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  textStyle: "xs",
  color: "fg.subtle",
  fontVariantNumeric: "tabular-nums",
});
const count = css({ display: "flex", alignItems: "center" });

/**
 * A step's state in a run, at the end of its row in the Steps tab. A step that runs per item also counts its items
 * done, and failed if any have.
 */
export const RunStatus = ({
  mark: { state, items },
}: {
  mark: StepRunMark;
}) => (
  <span className={status}>
    {items && items.done + items.failed > 0 && (
      <span className={counts}>
        <span className={count} aria-label={`${items.done} done`}>
          <RunGlyph state="done" size={12} />
          {items.done}
        </span>
        {items.failed > 0 && (
          <span className={count} aria-label={`${items.failed} failed`}>
            <RunGlyph state="failed" exclaim size={12} />
            {items.failed}
          </span>
        )}
      </span>
    )}
    <RunGlyph state={state} />
  </span>
);
