import { Button, Kbd, Tooltip } from "@hashintel/ds-components";

import { useEditorActions } from "../../../../../../react/state/editor-context";
import { EntityList } from "./entities-tree/entity-list";
import { useEntityTreeItems } from "./entities-tree/use-entity-tree-items";

export const EntitiesHeaderAction: React.FC = () => {
  const { setSearchOpen } = useEditorActions();

  return (
    <Tooltip
      content={
        <>
          Search list <Kbd keys="mod+f" variant="inherit" />
        </>
      }
    >
      <Button
        aria-label="Search list"
        size="xs"
        variant="ghost"
        iconName="search"
        onClick={() => setSearchOpen(true)}
      />
    </Tooltip>
  );
};

/** The entities of the active net: its nodes, and its token types, equations and parameters where the document has them. */
export const EntitiesTree: React.FC = () => {
  const groups = useEntityTreeItems();
  return <EntityList groups={groups} />;
};
