/**
 * The Optimizations section given over to one study: a top bar with Back to
 * list, the study's name and its actions, then the study body spread over
 * the section's width. The drawer shows the same body stacked.
 */
import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { describeStudy, StudyActions, StudyBody } from "./study-view";

import type { OptimizationRecord } from "../../../../../../react/optimizations/context";

const frameStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minWidth: "[0]",
  height: "full",
  backgroundColor: "neutral.s00",
});

// The same bar the section list has, so the switch between the two reads as
// one place changing what it shows.
const topBarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  minHeight: "[52px]",
  paddingLeft: "[12px]",
  paddingRight: "[20px]",
  paddingY: "[8px]",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s40",
  flexShrink: 0,
});

const titleBlockStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minWidth: "[0]",
});

const titleStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const descriptionStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const actionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: 0,
});

// Never scrolls itself: the study body keeps its summary band still and
// scrolls the region beneath it.
const bodyStyle = css({
  flex: "1",
  display: "flex",
  flexDirection: "column",
  minHeight: "[0]",
  overflow: "hidden",
  paddingX: "5",
});

export const OptimizationFullView = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { setSimulatePresentation } = use(EditorContext);
  const { setSelectedOptimizationId } = use(OptimizationsContext);

  return (
    <div className={frameStyle} data-optimization-full-view>
      <div className={topBarStyle}>
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          prefix={<Icon name="arrowLeft" size="sm" />}
          onClick={() => setSelectedOptimizationId(null)}
        >
          Back to list
        </Button>
        <div className={titleBlockStyle}>
          <span className={titleStyle}>{optimization.input.name}</span>
          <span className={descriptionStyle}>
            {describeStudy(optimization)}
          </span>
        </div>
        <div className={actionsStyle}>
          <StudyActions
            optimization={optimization}
            presentation="full"
            onPresentationChange={setSimulatePresentation}
            onClose={() => setSelectedOptimizationId(null)}
          />
        </div>
      </div>
      <div className={bodyStyle}>
        <StudyBody optimization={optimization} layout="full" />
      </div>
    </div>
  );
};
