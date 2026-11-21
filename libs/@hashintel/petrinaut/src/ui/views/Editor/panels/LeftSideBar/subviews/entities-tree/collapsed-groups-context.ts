import { createContext } from "react";

/**
 * The groups of the entities tree that are collapsed, by id. The sidebar
 * holds them above its panel: the tree unmounts with a closed sidebar and
 * finds its groups as the user left them when it opens again.
 */
export const CollapsedGroupsContext = createContext<{
  collapsedGroups: ReadonlySet<string>;
  toggleGroup: (groupId: string) => void;
}>({ collapsedGroups: new Set(), toggleGroup: () => {} });
