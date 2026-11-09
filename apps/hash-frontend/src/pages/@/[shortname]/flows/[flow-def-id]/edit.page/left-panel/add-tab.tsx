import { useState } from "react";

import { TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { CollapseButton } from "../shared/collapse-button";
import { useRecentActions } from "../shared/recent-actions";
import {
  addableActionGroups,
  searchAddableActions,
  stepNoun,
} from "../shared/step-display";
import { TreeRow } from "./shared/tree-row";

import type { AddableAction } from "../shared/step-display";

const section = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
  p: "2",
  overflowY: "auto",
});
const noMatches = css({
  textStyle: "sm",
  color: "fg.muted",
  px: "3",
  py: "2",
});

/** The actions that can be added, in collapsible groups, or the ones whose name matches the search. */
export const AddTab = ({
  onAddStep,
}: {
  onAddStep: (actionDefinitionId: string) => void;
}) => {
  const [query, setQuery] = useState("");
  const { recordAddedAction } = useRecentActions();
  const [expandedGroupIds, setExpandedGroupIds] = useState(
    () => new Set<string>(),
  );

  const toggleGroup = (groupId: string) =>
    setExpandedGroupIds((expanded) => {
      const next = new Set(expanded);

      if (!next.delete(groupId)) {
        next.add(groupId);
      }

      return next;
    });

  const actionRow = (action: AddableAction, depth: number) => (
    <TreeRow
      key={action.actionDefinitionId}
      depth={depth}
      icon={action.icon}
      tone={action.tone}
      label={action.label}
      actionDefinitionId={action.actionDefinitionId}
      onClick={() => {
        recordAddedAction(action.actionDefinitionId);
        onAddStep(action.actionDefinitionId);
      }}
    />
  );

  const matches = query.trim() === "" ? null : searchAddableActions(query);

  return (
    <div className={section}>
      <TextInput
        size="sm"
        value={query}
        onChange={setQuery}
        placeholder={`Search ${stepNoun.plural}`}
        aria-label={`Search ${stepNoun.plural}`}
        prefix={{ iconName: "search", variant: "subtle" }}
        clearable
      />
      <div>
        {matches === null ? (
          addableActionGroups.map(({ groupId, label, actions }) => {
            const expanded = expandedGroupIds.has(groupId);

            return (
              <div key={groupId}>
                <TreeRow
                  depth={0}
                  label={label}
                  expander={
                    <CollapseButton
                      collapsed={!expanded}
                      onToggle={() => toggleGroup(groupId)}
                    />
                  }
                  stepCount={actions.length}
                  onClick={() => toggleGroup(groupId)}
                />
                {expanded && actions.map((action) => actionRow(action, 1))}
              </div>
            );
          })
        ) : matches.length > 0 ? (
          matches.map((action) => actionRow(action, 0))
        ) : (
          <p className={noMatches}>No matching {stepNoun.plural}</p>
        )}
      </div>
    </div>
  );
};
