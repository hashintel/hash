import { useMenuContext } from "@ark-ui/react/menu";
import { useEffect, useRef, useState } from "react";

import { Menu, SelectableListSearch } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ActionIo, ActionIoTooltip } from "../shared/action-io";
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
type OnHighlight = (action: AddableAction | null) => void;

/* As wide as the description, so the tooltip opens beside the row rather than over it. */
const actionNameTrigger = css({ flex: "1" });
/* The menu's text style, as the tooltip's trigger sets a line height of 0, which collapses the name onto its description. */
const actionName = css({ textStyle: "sm" });
const highlightedActionIo = css({
  pt: "1.5",
  borderTop: "1px solid {colors.neutral.s35}",
  textStyle: "xs",
  color: "fg.muted",
});

/**
 * An action's name in its row, reporting the action while the row is highlighted. The DS `Menu` only reports the
 * highlighted item with key events, before the key moves it, and only for its top-level list, so this asks the Ark
 * menu rendering the row, which is the group's own menu for a row in a submenu.
 */
const ActionItemName = ({
  itemId,
  action,
  onHighlight,
}: {
  itemId: string;
  action: AddableAction;
  onHighlight: OnHighlight;
}) => {
  const highlighted = useMenuContext().highlightedValue === itemId;

  useEffect(() => {
    if (!highlighted) {
      return;
    }
    onHighlight(action);

    return () => onHighlight(null);
  }, [highlighted, action, onHighlight]);

  return (
    <ActionIoTooltip
      actionDefinitionId={action.actionDefinitionId}
      className={actionNameTrigger}
    >
      <span className={actionName}>{action.label}</span>
    </ActionIoTooltip>
  );
};

/** `group` keeps ids apart when an action is listed twice in one menu. */
const getActionItem = (
  action: AddableAction,
  { onPick, onHighlight }: { onPick: OnPick; onHighlight: OnHighlight },
  group?: string,
): MenuItem => {
  const id = group
    ? `${group}:${action.actionDefinitionId}`
    : action.actionDefinitionId;

  return {
    id,
    text: (
      <ActionItemName itemId={id} action={action} onHighlight={onHighlight} />
    ),
    description: action.description,
    icon: action.icon,
    onClick: () => onPick(action.actionDefinitionId),
  };
};

const getMenuItems = ({
  query,
  emptyFlow,
  recentActions,
  ...handlers
}: {
  query: string;
  emptyFlow: boolean;
  recentActions: AddableAction[];
  onPick: OnPick;
  onHighlight: OnHighlight;
}): ItemOrGroup<MenuItem>[] => {
  if (query.trim() !== "") {
    const matches = searchAddableActions(query);

    return matches.length > 0
      ? matches.map((action) => getActionItem(action, handlers))
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
        items: actions.map((action) => getActionItem(action, handlers, id)),
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
              items: actions.map((action) => getActionItem(action, handlers)),
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
  /* Its inputs and outputs show in the footer, which the keyboard can reach, unlike the row's tooltip. */
  const [highlightedAction, setHighlightedAction] =
    useState<AddableAction | null>(null);
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
        onHighlight: setHighlightedAction,
      })}
      header={
        <SelectableListSearch
          value={query}
          onChange={setQuery}
          placeholder="Search"
          aria-label={`Search ${stepNoun.plural}`}
        />
      }
      footer={
        highlightedAction && (
          <ActionIo
            actionDefinitionId={highlightedAction.actionDefinitionId}
            className={highlightedActionIo}
          />
        )
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
