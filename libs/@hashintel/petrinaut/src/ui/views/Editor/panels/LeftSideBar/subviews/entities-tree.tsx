import { useState, type ReactNode } from "react";

import { Button } from "@hashintel/ds-components";

import { useEditorActions } from "../../../../../../react/state/editor-context";
import { ShortcutTooltip } from "../../../../../keyboard-shortcut";
import { CollapsedGroupsContext } from "./entities-tree/collapsed-groups-context";
import { EntityList } from "./entities-tree/entity-list";
import { useEntityTreeItems } from "./entities-tree/use-entity-tree-items";

export const EntitiesHeaderAction: React.FC = () => {
  const { setSearchOpen } = useEditorActions();

  return (
    <ShortcutTooltip label="Search list" shortcut="mod+f">
      <Button
        aria-label="Search list"
        size="xs"
        variant="ghost"
        iconName="search"
        onClick={() => setSearchOpen(true)}
      />
    </ShortcutTooltip>
  );
};

/** The entities of the active net: its nodes, and its token types, equations and parameters where the document has them. */
export const EntitiesTree: React.FC = () => {
  const groups = useEntityTreeItems();
  return <EntityList groups={groups} />;
};

/** Holds which groups of the tree are collapsed, for the tree below it. */
export const CollapsedGroupsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleGroup = (groupId: string) =>
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (!next.delete(groupId)) {
        next.add(groupId);
      }
      return next;
    });

  return (
    <CollapsedGroupsContext value={{ collapsedGroups, toggleGroup }}>
      {children}
    </CollapsedGroupsContext>
  );
};
