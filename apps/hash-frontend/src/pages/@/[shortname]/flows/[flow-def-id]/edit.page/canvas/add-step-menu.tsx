import { useEffect, useRef, useState } from "react";

import { Menu, SelectableListSearch } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ActionIoTooltip } from "../shared/action-io-tooltip";
import { useRecentActions } from "../shared/recent-actions";
import {
  addableActionGroups,
  recommendedActions,
  searchAddableActions,
  stepNoun,
} from "../shared/step-display";

import type { AddableAction } from "../shared/step-display";
import type { ItemOrGroup, MenuItem, Position } from "@hashintel/ds-components";
import type { ReactElement } from "react";

type OnPick = (actionDefinitionId: string) => void;

/* As wide as the description, so the tooltip opens beside the row rather than over it. */
const actionNameTrigger = css({ flex: "1" });
/* The menu's text style, as the tooltip's trigger sets a line height of 0, which collapses the name onto its description. */
const actionName = css({ textStyle: "sm" });

/** `group` keeps ids apart when an action is listed twice in one menu. */
const getActionItem = (
  action: AddableAction,
  onPick: OnPick,
  group?: string,
): MenuItem => ({
  id: group
    ? `${group}:${action.actionDefinitionId}`
    : action.actionDefinitionId,
  text: (
    <ActionIoTooltip
      actionDefinitionId={action.actionDefinitionId}
      className={actionNameTrigger}
    >
      <span className={actionName}>{action.label}</span>
    </ActionIoTooltip>
  ),
  description: action.description,
  icon: action.icon,
  onClick: () => onPick(action.actionDefinitionId),
});

const getMenuItems = ({
  query,
  emptyFlow,
  recentActions,
  onPick,
}: {
  query: string;
  emptyFlow: boolean;
  recentActions: AddableAction[];
  onPick: OnPick;
}): ItemOrGroup<MenuItem>[] => {
  if (query.trim() !== "") {
    const matches = searchAddableActions(query);

    return matches.length > 0
      ? matches.map((action) => getActionItem(action, onPick))
      : [
          {
            id: "no-matches",
            text: `No matching ${stepNoun.plural}`,
            disabled: true,
            onClick: () => {},
          },
        ];
  }

  const shortlists = [
    {
      id: "recommended",
      label: "Recommended",
      actions: emptyFlow ? recommendedActions : [],
    },
    { id: "recent", label: "Recent", actions: recentActions },
  ];

  return [
    ...shortlists
      .filter(({ actions }) => actions.length > 0)
      .map(({ id, label, actions }) => ({
        id,
        label,
        items: actions.map((action) => getActionItem(action, onPick, id)),
      })),
    {
      id: "browse-all",
      label: "Browse all",
      items: addableActionGroups.map(
        ({ groupId, label, icon, actions }): MenuItem => ({
          id: groupId,
          text: label,
          icon,
          subItems: [
            {
              id: groupId,
              label,
              items: actions.map((action) => getActionItem(action, onPick)),
            },
          ],
        }),
      ),
    },
  ];
};

/** The list of actions that can be added, with a search field, opened from `trigger`. */
export const AddStepMenu = ({
  trigger,
  position,
  emptyFlow,
  onPick,
  onOpen,
}: {
  trigger: ReactElement;
  position?: Position;
  /** Whether the flow has no steps yet, when the menu recommends some to start with. */
  emptyFlow: boolean;
  onPick: OnPick;
  onOpen?: (open: boolean) => void;
}) => {
  const [query, setQuery] = useState("");
  const { recentActions, recordAddedAction } = useRecentActions();

  return (
    <Menu
      trigger={trigger}
      position={position}
      items={getMenuItems({
        query,
        emptyFlow,
        recentActions,
        onPick: (actionDefinitionId) => {
          recordAddedAction(actionDefinitionId);
          onPick(actionDefinitionId);
        },
      })}
      header={
        <SelectableListSearch
          value={query}
          onChange={setQuery}
          placeholder="Search"
          aria-label={`Search ${stepNoun.plural}`}
        />
      }
      onOpen={(open) => {
        if (!open) {
          setQuery("");
        }
        onOpen?.(open);
      }}
    />
  );
};

/**
 * The add menu at a point, open while mounted. The DS `Menu` only opens from its own trigger, so this clicks an
 * invisible trigger laid over `anchor`.
 */
export const AddStepMenuAt = ({
  anchor,
  emptyFlow,
  onPick,
  onClose,
}: {
  /** In window coordinates. */
  anchor: DOMRect;
  emptyFlow: boolean;
  onPick: OnPick;
  onClose: () => void;
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    /* A frame later, so the right-click menu closing doesn't close this too. */
    const frame = requestAnimationFrame(() => triggerRef.current?.click());

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <AddStepMenu
      emptyFlow={emptyFlow}
      onPick={onPick}
      onOpen={(open) => {
        if (!open) {
          onClose();
        }
      }}
      trigger={
        <span
          ref={triggerRef}
          aria-label={`Add a ${stepNoun.singular}`}
          tabIndex={-1}
          style={{
            position: "fixed",
            left: anchor.left,
            top: anchor.top,
            width: anchor.width,
            height: anchor.height,
            pointerEvents: "none",
          }}
        />
      }
    />
  );
};
