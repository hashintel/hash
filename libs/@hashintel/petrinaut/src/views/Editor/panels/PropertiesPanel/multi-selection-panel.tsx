import { css } from "@hashintel/ds-helpers/css";
import { createContext, use } from "react";
import { GrMultiple } from "react-icons/gr";
import { TbTrash } from "react-icons/tb";

import { IconButton } from "../../../../components/icon-button";
import type { SubView } from "../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import { EditorContext } from "../../../../state/editor-context";
import type { SelectionItem, SelectionMap } from "../../../../state/selection";
import { useIsReadOnly } from "../../../../state/use-is-read-only";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const summaryStyle = css({
  fontSize: "sm",
  color: "neutral.s110",
  lineHeight: "[1.5]",
});

interface MultiSelectionData {
  items: SelectionItem[];
  deleteItemsByIds: (items: SelectionMap) => void;
}

const MultiSelectionContext = createContext<MultiSelectionData | null>(null);

function useMultiSelectionContext() {
  const ctx = use(MultiSelectionContext);
  if (!ctx) {
    throw new Error(
      "useMultiSelectionContext must be used within MultiSelectionPanel",
    );
  }
  return ctx;
}

const TYPE_LABELS: Record<string, string> = {
  place: "place",
  transition: "transition",
  arc: "arc",
  type: "type",
  differentialEquation: "differential equation",
  parameter: "parameter",
};

const MultiSelectionContent: React.FC = () => {
  const { items } = useMultiSelectionContext();

  // Group items by type
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }

  const summary = Array.from(counts.entries())
    .map(([type, count]) => {
      const label = TYPE_LABELS[type] ?? type;
      return `${count} ${label}${count > 1 ? "s" : ""}`;
    })
    .join(", ");

  return <div className={summaryStyle}>{summary}</div>;
};

const DeleteSelectionAction: React.FC = () => {
  const { items, deleteItemsByIds } = useMultiSelectionContext();
  const { clearSelection } = use(EditorContext);
  const isReadOnly = useIsReadOnly();

  return (
    <IconButton
      aria-label="Delete selected"
      size="xs"
      colorScheme="red"
      disabled={isReadOnly}
      onClick={() => {
        deleteItemsByIds(new Map(items.map((item) => [item.id, item])));
        clearSelection();
      }}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Delete selected"}
    >
      <TbTrash />
    </IconButton>
  );
};

const multiSelectionMainSubView: SubView = {
  id: "multi-selection-main",
  title: "Multiple Selection",
  icon: GrMultiple,
  main: true,
  component: MultiSelectionContent,
  renderHeaderAction: () => <DeleteSelectionAction />,
};

const subViews: SubView[] = [multiSelectionMainSubView];

interface MultiSelectionPanelProps {
  items: SelectionItem[];
  deleteItemsByIds: (items: SelectionMap) => void;
}

export const MultiSelectionPanel: React.FC<MultiSelectionPanelProps> = ({
  items,
  deleteItemsByIds,
}) => {
  return (
    <div className={containerStyle}>
      <MultiSelectionContext value={{ items, deleteItemsByIds }}>
        <VerticalSubViewsContainer name="multi-selection" subViews={subViews} />
      </MultiSelectionContext>
    </div>
  );
};
