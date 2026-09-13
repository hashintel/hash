/**
 * The Optimizations section given over to one study: the study frame filling
 * the section, with Back to list before the title and the actions in the
 * footer. The drawer shows the same frame over the list.
 */
import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { OptimizationsContext } from "../../../../../../react/optimizations/context";
import { StudyFrame } from "./study-view";

import type { OptimizationRecord } from "../../../../../../react/optimizations/context";

const sectionStyle = css({
  display: "flex",
  flex: "1",
  minWidth: "[0]",
  height: "full",
});

export const OptimizationFullView = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { setSelectedOptimizationId } = use(OptimizationsContext);
  const backToList = () => setSelectedOptimizationId(null);

  return (
    <div className={sectionStyle} data-optimization-full-view>
      <StudyFrame
        optimization={optimization}
        presentation="full"
        leading={
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            prefix={<Icon name="arrowLeft" size="sm" />}
            onClick={backToList}
          >
            Back to list
          </Button>
        }
        onClose={backToList}
      />
    </div>
  );
};
