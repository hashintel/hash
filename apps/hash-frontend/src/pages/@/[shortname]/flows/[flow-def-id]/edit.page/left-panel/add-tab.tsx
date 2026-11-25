import { useState } from "react";

import { TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { CollapseButton } from "../shared/collapse-button";
import { useRecentActions } from "../shared/recent-actions";
import {
  getActionTone,
  isAddableAction,
  listedActionGroups,
  searchListedActions,
  stepNoun,
  upcomingNote,
} from "../shared/step-display";
import { TreeRow } from "./shared/tree-row";

import type { ListedAction } from "../shared/step-display";

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

/** The listed actions, in collapsible groups, or the ones whose name matches the search. */
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

  const actionRow = (action: ListedAction, depth: number) => {
    const addable = isAddableAction(action);

    return (
      <TreeRow
        key={addable ? action.actionDefinitionId : action.upcomingId}
        depth={depth}
        icon={action.icon}
        tone={getActionTone(action)}
        label={action.label}
        disabledTooltip={addable ? undefined : upcomingNote}
        onClick={
          addable
            ? () => {
                recordAddedAction(action.actionDefinitionId);
                onAddStep(action.actionDefinitionId);
              }
            : undefined
        }
      />
    );
  };

  const matches = query.trim() === "" ? null : searchListedActions(query);

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
          listedActionGroups.map(({ groupId, label, actions }) => {
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
