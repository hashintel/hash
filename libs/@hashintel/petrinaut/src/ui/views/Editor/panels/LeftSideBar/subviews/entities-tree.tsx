import { use } from "react";

import { Button } from "@hashintel/ds-components";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { ShortcutTooltip } from "../../../../../keyboard-shortcut";
import { EntityList } from "./entities-tree/entity-list";
import { useEntityTreeItems } from "./entities-tree/use-entity-tree-items";

import type { SubView } from "../../../../../components/sub-view/types";

const EntitiesHeaderAction: React.FC = () => {
  const { setSearchOpen } = use(EditorContext);

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
const EntitiesTree: React.FC = () => (
  <EntityList items={useEntityTreeItems()} />
);

export const entitiesTreeSubView: SubView = {
  id: "entities-tree",
  title: "Entities",
  component: EntitiesTree,
  headerAction: EntitiesHeaderAction,
  main: true,
  alwaysShowHeaderAction: true,
};
