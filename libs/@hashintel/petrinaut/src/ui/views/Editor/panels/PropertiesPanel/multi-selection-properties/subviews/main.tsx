import { use } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { usePetrinautMutations } from "../../../../../../../react/editing/use-petrinaut-mutations";
import { useEditorActions } from "../../../../../../../react/state/editor-context";
import { DeleteItemButton } from "../../delete-item-button";
import { SelectedItemsContext } from "../context";

export const MultipleIcon = () => <Icon name="layer" />;

const summaryStyle = css({
  fontSize: "sm",
  color: "neutral.s110",
  lineHeight: "[1.5]",
});

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

export const MultiSelectionContent: React.FC = () => {
  const items = use(SelectedItemsContext);

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

export const DeleteSelectionAction: React.FC = () => {
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
