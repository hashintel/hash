import { useState } from "react";

import { Button, SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

type LeftPanelTab = "steps" | "add";

const panel = css({
  display: "flex",
  flexDirection: "column",
  flexShrink: "0",
  width: "[248px]",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "bd.subtle",
});
const tabs = css({ p: "2" });
const stepsSection = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  px: "3",
  py: "2",
});
const stepsHeader = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});
const stepCount = css({ textStyle: "xs", color: "fg.subtle" });
const placeholder = css({ textStyle: "sm", color: "fg.muted" });
const addPlaceholder = css({
  textStyle: "sm",
  color: "fg.muted",
  px: "3",
  py: "2",
});

/**
 * The flow editor's left panel: the flow's steps, and the steps that can be added to it. Both lists come in later
 * issues; until then, each tab says what it will hold.
 */
export const LeftPanel = ({ steps }: { steps: StepDefinition<string>[] }) => {
  const [tab, setTab] = useState<LeftPanelTab>("steps");

  return (
    <div className={panel}>
      <div className={tabs}>
        <SegmentedControl
          size="md"
          aria-label="Left panel"
          value={tab}
          onChange={setTab}
          items={[
            { value: "steps", label: "Steps" },
            { value: "add", label: "Add" },
          ]}
        />
      </div>
      {tab === "steps" ? (
        <div className={stepsSection}>
          <div className={stepsHeader}>
            <p className={stepCount}>
              {steps.length} {steps.length === 1 ? "step" : "steps"}
            </p>
            <Button
              variant="ghost"
              size="xs"
              iconName="collapse"
              tooltip="Collapse all"
              disabled
            />
          </div>
          {steps.length === 0 && (
            <p className={placeholder}>Steps you add appear here.</p>
          )}
        </div>
      ) : (
        <p className={addPlaceholder}>
          Actions you can add will be listed here.
        </p>
      )}
    </div>
  );
};
