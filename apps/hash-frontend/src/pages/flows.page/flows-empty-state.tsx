import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { DsComponentsScope } from "../shared/ds-components-scope";
import { NewFlowButton } from "./new-flow-button";

import type { CreateFlow } from "./use-create-flow";

const emptyState = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4",
  py: "24",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "xl",
});
const iconCircle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "12",
  height: "12",
  borderRadius: "full",
  bg: "bg.subtle",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
});
const copy = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "1",
});
const heading = css({ textStyle: "base", fontWeight: "semibold" });
const description = css({ textStyle: "sm", color: "fg.muted" });

/** Shown on the flows page when there are no flows yet. */
export const FlowsEmptyState = ({ createFlow }: { createFlow: CreateFlow }) => (
  <DsComponentsScope>
    <div className={emptyState}>
      <div className={iconCircle}>
        <Icon name="infinity" size="md" />
      </div>
      <div className={copy}>
        <h2 className={heading}>No flows yet</h2>
        <p className={description}>
          A flow runs the same steps each time: by hand, on a schedule, or when
          data changes.
        </p>
      </div>
      <NewFlowButton {...createFlow} />
    </div>
  </DsComponentsScope>
);
