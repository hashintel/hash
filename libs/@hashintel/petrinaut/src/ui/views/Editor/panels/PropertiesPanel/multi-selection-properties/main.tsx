import { VerticalSubViewsContainer } from "../../../../../sub-view/vertical-sub-views-container";
import { SelectedItemsContext } from "./context";
import { multiSelectionSubViews } from "./sub-views";

import type { SelectionItem } from "@hashintel/petrinaut-core";

export const MultiSelectionPanel: React.FC<{ items: SelectionItem[] }> = ({
  items,
}) => (
  <SelectedItemsContext value={items}>
    <VerticalSubViewsContainer
      name="multi-selection"
      subViews={multiSelectionSubViews}
    />
  </SelectedItemsContext>
);
