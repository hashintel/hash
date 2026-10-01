import { use, useEffect } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  leverAnchorId,
  leverAnchorKind,
  leverKindLabel,
  leverName,
} from "../../react/controller-prototype/controllers";
import {
  setActiveLeverRow,
  useActiveLeverRow,
} from "../../react/controller-prototype/active-lever-row";
import {
  toggleControllerExpanded,
  useExpandedControllers,
} from "../../react/controller-prototype/expanded-controllers";
import { useControllers } from "../../react/controller-prototype/use-controllers";
import { EditorContext } from "../../react/state/editor-context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../react/state/user-settings-context";
import { useIsReadOnly } from "../../react/state/use-is-read-only";
import {
  PlaceFilledIcon,
  TransitionFilledIcon,
} from "../constants/entity-icons";
import { UI_MESSAGES } from "../constants/ui-messages";
import { LeverRowIcon } from "./lever-glyph";

import type { SelectionItem } from "@hashintel/petrinaut-core";
import type { ComponentType } from "react";

export const leverTagStyle = css({
  flexShrink: "0",
  fontSize: "[11px]",
  lineHeight: "[16px]",
  fontWeight: "medium",
  color: "neutral.s100",
  backgroundColor: "neutral.s20",
  borderRadius: "md",
  paddingX: "1.5",
});

export type ControllerTreeRow = {
  id: string;
  name: string;
  icon?: ComponentType<{ size: number }>;
  selectionItem: SelectionItem;
  tag?: string;
  indent?: number;
  onSelect?: () => void;
  isSelected?: (selectedByDefault: boolean) => boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
};

const AddControllerAction: React.FC = () => {
  const isReadOnly = useIsReadOnly();
  const { controllers, updateControllers } = useControllers();
  const { selectItem } = use(EditorContext);

  return (
    <Button
      size="xs"
      variant="ghost"
      iconName="plus"
      aria-label="Add controller"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Add controller"}
      onClick={(event) => {
        event.stopPropagation();
        const id = `controller__${Date.now()}`;
        updateControllers((current) => [
          ...current,
          { id, name: `Controller ${controllers.length + 1}`, levers: [] },
        ]);
        selectItem({ type: "controller", id });
      }}
    />
  );
};

/**
 * The Controllers group for the Entities list: one row per controller, then
 * its levers indented under it, each tagged with its kind.
 */
export const useControllersTreeGroup = (
  addAction: (action: ComponentType) => ComponentType | undefined,
) => {
  const { controllers } = useControllers();
  const { petriNetDefinition } = use(SDCPNContext);
  const { selection } = use(EditorContext);
  const { updateSubViewSection } = use(UserSettingsContext);
  const activeRow = useActiveLeverRow();
  const expanded = useExpandedControllers();

  useEffect(() => {
    if (
      activeRow &&
      !(selection.size === 1 && selection.has(activeRow.nodeId))
    ) {
      setActiveLeverRow(null);
    }
  }, [activeRow, selection]);

  const children: ControllerTreeRow[] = controllers.flatMap((controller) => [
    {
      id: controller.id,
      name: controller.name,
      icon: LeverRowIcon,
      selectionItem: { type: "controller", id: controller.id },
      expanded: expanded.has(controller.id),
      onToggleExpanded: () => toggleControllerExpanded(controller.id),
    },
    ...(expanded.has(controller.id) ? controller.levers : []).map(
      (lever): ControllerTreeRow => {
      const name = leverName(petriNetDefinition, lever);
      const rowId = `lever:${controller.id}:${lever.id}`;
      const selectionItem: SelectionItem =
        name === null
          ? { type: "controller", id: controller.id }
          : { type: leverAnchorKind(lever), id: leverAnchorId(lever) };
      const section =
        name === null
          ? undefined
          : lever.kind === "rate"
          ? "transition-firing-time"
          : lever.kind === "tokenField"
          ? "transition-results"
          : undefined;
      return {
        id: rowId,
        name: name ?? "Missing node",
        icon:
          leverAnchorKind(lever) === "place"
            ? PlaceFilledIcon
            : TransitionFilledIcon,
        selectionItem,
        tag: leverKindLabel[lever.kind],
        indent: 1,
        onSelect: () => {
          setActiveLeverRow({ rowId, nodeId: selectionItem.id });
          if (section) {
            updateSubViewSection("transition-properties", section, {
              collapsed: false,
            });
          }
        },
        isSelected: (selectedByDefault) =>
          selectedByDefault && activeRow?.rowId === rowId,
      };
      },
    ),
  ]);

  return {
    id: "group-controllers",
    name: "Controllers",
    emptyGroupMessage: "No controllers",
    renderGroupAction: addAction(AddControllerAction),
    children,
  };
};
