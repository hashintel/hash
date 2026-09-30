import { use } from "react";

import { Button, Menu, RightClickMenu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { usePetrinautMutations } from "../../react";
import { withoutControllers } from "../../react/controller-prototype/controllers";
import {
  addLevers,
  holdsAll,
  leverOptionsFor,
} from "../../react/controller-prototype/lever-options";
import { useControllers } from "../../react/controller-prototype/use-controllers";
import { EditorContext } from "../../react/state/editor-context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../constants/ui-messages";
import { LeverGlyph } from "./lever-glyph";

import type { Controller } from "../../react/controller-prototype/controllers";
import type { LeverDraft } from "../../react/controller-prototype/lever-options";
import type { MenuItem } from "@hashintel/ds-components";
import type { SelectionItem } from "@hashintel/petrinaut-core";

type MenuEntry = MenuItem | { id: string; label: string; items: MenuItem[] };

const controllerItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

const fieldNameStyle = css({ fontFamily: "mono" });

let leverCounter = 0;
const newLeverId = () => `lever__${Date.now()}_${leverCounter++}`;
const newControllerId = () => `controller__${Date.now()}`;

/**
 * The kind items for "Add to controller", filtered to what fits the targets.
 * With one controller a kind adds straight to it; with two or more the kind
 * opens a list of controllers plus "New controller…"; with none, a kind
 * creates the first controller.
 */
export const useLeverKindItems = (targetIds: string[]): MenuEntry[] => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { controllers, updateControllers } = useControllers();
  const { selectItem } = use(EditorContext);

  const addTo = (controllerId: string | null, drafts: LeverDraft[]) => {
    const id = controllerId ?? newControllerId();
    updateControllers((current) => {
      const next =
        controllerId === null
          ? [
              ...current,
              {
                id,
                name: `Controller ${current.length + 1}`,
                levers: [],
              } satisfies Controller,
            ]
          : current;
      return next.map((controller) =>
        controller.id === id
          ? addLevers(controller, drafts, newLeverId)
          : controller,
      );
    });
    selectItem({ type: "controller", id });
  };

  const leaf = (key: string, text: MenuItem["text"], drafts: LeverDraft[]) => {
    if (controllers.length <= 1) {
      const only = controllers[0];
      const already = only ? holdsAll(only, drafts) : false;
      return {
        id: key,
        text,
        disabled: already,
        suffix: already ? "Added" : undefined,
        onClick: () => addTo(only?.id ?? null, drafts),
      } as MenuItem;
    }
    return {
      id: key,
      text,
      subItems: [
        ...controllers.map(
          (controller): MenuItem =>
            ({
              id: `${key}:${controller.id}`,
              text: (
                <span className={controllerItemStyle}>
                  <LeverGlyph size={13} />
                  {controller.name}
                </span>
              ),
              disabled: holdsAll(controller, drafts),
              suffix: holdsAll(controller, drafts) ? "Added" : undefined,
              onClick: () => addTo(controller.id, drafts),
            }) as MenuItem,
        ),
        {
          id: `${key}:new`,
          text: "New controller…",
          icon: "plus",
          onClick: () => addTo(null, drafts),
        },
      ],
    } as MenuItem;
  };

  return leverOptionsFor(petriNetDefinition, targetIds).map(
    (option): MenuEntry => {
      if ("levers" in option) {
        return leaf(option.id, option.label, option.levers);
      }
      const places = [...new Set(option.fields.map((f) => f.placeId))];
      return {
        id: option.id,
        text: option.label,
        subItems: places.map((placeId) => ({
          id: `${option.id}:${placeId}`,
          label:
            option.fields.find((f) => f.placeId === placeId)?.placeName ?? "",
          items: option.fields
            .filter((field) => field.placeId === placeId)
            .map((field) =>
              leaf(
                `${option.id}:${placeId}:${field.elementId}`,
                <span className={fieldNameStyle}>{field.fieldName}</span>,
                [
                  {
                    kind: "tokenField",
                    transitionId: option.transitionId,
                    placeId,
                    elementId: field.elementId,
                  },
                ],
              ),
            ),
        })),
      } as MenuItem;
    },
  );
};

/**
 * The nodes a right-click acts on: the whole selection when the clicked node
 * is part of it, else the clicked node alone.
 */
const useTargets = (nodeId: string): SelectionItem[] => {
  const { selection } = use(EditorContext);
  const { getItemType } = use(SDCPNContext);
  if (selection.has(nodeId) && selection.size > 1) {
    return withoutControllers(Array.from(selection.values()));
  }
  const type = getItemType(nodeId);
  return type === "place" || type === "transition"
    ? [{ type, id: nodeId }]
    : [];
};

/** Right-click menu for a node or an Entities row: Add to controller ▸ kind, and Delete. */
export const NodeContextMenu: React.FC<{
  nodeId: string;
  children: React.ReactNode;
}> = ({ nodeId, children }) => {
  const targets = useTargets(nodeId);
  const kindItems = useLeverKindItems(targets.map((target) => target.id));
  const { deleteItemsByIds } = usePetrinautMutations();
  const { clearSelection } = use(EditorContext);
  const isReadOnly = useIsReadOnly();

  if (targets.length === 0) {
    return children;
  }

  const items: MenuItem[] = [
    {
      id: "add-to-controller",
      text: "Add to controller",
      disabled: isReadOnly || kindItems.length === 0,
      description:
        kindItems.length === 0
          ? "Select only places or only transitions"
          : undefined,
      subItems: kindItems,
    } as MenuItem,
    {
      id: "delete",
      text: targets.length > 1 ? `Delete ${targets.length} items` : "Delete",
      tone: "error",
      disabled: isReadOnly,
      onClick: () => {
        deleteItemsByIds({ items: withoutControllers(targets) });
        clearSelection();
      },
    },
  ];

  return <RightClickMenu items={items}>{children}</RightClickMenu>;
};

const multiSelectionActionStyle = css({ marginTop: "3" });

/** "Add to controller" for the multi-selection panel, with the same kind list as the right-click menu. */
export const AddToControllerButton: React.FC<{ items: SelectionItem[] }> = ({
  items,
}) => {
  const nodeIds = withoutControllers(items)
    .filter((item) => item.type === "place" || item.type === "transition")
    .map((item) => item.id);
  const kindItems = useLeverKindItems(nodeIds);
  const isReadOnly = useIsReadOnly();

  if (nodeIds.length === 0) {
    return null;
  }

  const disabled = isReadOnly || kindItems.length === 0;
  return (
    <div className={multiSelectionActionStyle}>
      {disabled ? (
        <Button
          size="sm"
          variant="subtle"
          disabled
          tooltip={
            isReadOnly
              ? UI_MESSAGES.READ_ONLY_MODE
              : "Select only places or only transitions"
          }
        >
          Add to controller
        </Button>
      ) : (
        <Menu
          trigger={
            <Button size="sm" variant="subtle">
              Add to controller
            </Button>
          }
          items={kindItems}
        />
      )}
    </div>
  );
};
