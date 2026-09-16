import { use } from "react";

import { SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../react/state/editor-context";

const barStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: "0",
  paddingX: "3",
  paddingY: "2",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  backgroundColor: "neutral.bg.surface",
});

export const EditViewSelector = () => {
  const { editViewMode, setEditViewMode } = use(EditorContext);

  return (
    <div className={barStyle}>
      <SegmentedControl
        aria-label="Edit view"
        size="sm"
        value={editViewMode}
        onChange={setEditViewMode}
        items={[
          { label: "Canvas", value: "canvas" },
          { label: "Notebook", value: "notebook" },
        ]}
      />
    </div>
  );
};
