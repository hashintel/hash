import { createContext, use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const MultipleIcon = () => <Icon name="layer" />;

import { usePetrinautMutations } from "../../../../../react";
import { useEditorActions } from "../../../../../react/state/editor-context";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import { DeleteItemButton } from "./delete-item-button";

import type { SubView } from "../../../../components/sub-view/types";
import type { SelectionItem } from "@hashintel/petrinaut-core";

const summaryStyle = css({
  fontSize: "sm",
  color: "neutral.s110",
  lineHeight: "[1.5]",
});

const SelectedItemsContext = createContext<SelectionItem[]>([]);

const TYPE_LABELS: Record<string, string> = {
  place: "place",
  transition: "transition",
  arc: "arc",
  componentInstance: "component instance",
  fusion: "fusion",
  type: "type",
  differentialEquation: "differential equation",
  parameter: "parameter",
};

const MultiSelectionContent: React.FC = () => {
  const items = use(SelectedItemsContext);

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
  const items = use(SelectedItemsContext);
  const { deleteItemsByIds } = usePetrinautMutations();
  const { clearSelection } = useEditorActions();

  return (
    <DeleteItemButton
      label="Delete selected"
      size="xs"
      onDelete={() => {
        deleteItemsByIds({ items });
        clearSelection();
      }}
    />
  );
};

const multiSelectionMainSubView: SubView = {
  id: "multi-selection-main",
  title: "Multiple Selection",
  icon: MultipleIcon,
  main: true,
  component: MultiSelectionContent,
  renderHeaderAction: () => <DeleteSelectionAction />,
  headerActionMutates: true,
  alwaysShowHeaderAction: true,
};

const subViews: SubView[] = [multiSelectionMainSubView];

export const MultiSelectionPanel: React.FC<{ items: SelectionItem[] }> = ({
  items,
}) => (
  <SelectedItemsContext value={items}>
    <VerticalSubViewsContainer name="multi-selection" subViews={subViews} />
  </SelectedItemsContext>
);
