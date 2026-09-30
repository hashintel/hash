import { use } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  leverAnchorId,
  leverAnchorKind,
  leverKindLabel,
  leverName,
} from "../../react/controller-prototype/controllers";
import { useControllers } from "../../react/controller-prototype/use-controllers";
import { EditorContext } from "../../react/state/editor-context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
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

  const children: ControllerTreeRow[] = controllers.flatMap((controller) => [
    {
      id: controller.id,
      name: controller.name,
      icon: LeverRowIcon,
      selectionItem: { type: "controller", id: controller.id },
    },
    ...controller.levers.map((lever): ControllerTreeRow => {
      const name = leverName(petriNetDefinition, lever);
      return {
        id: `lever:${controller.id}:${lever.id}`,
        name: name ?? "Missing node",
        icon:
          leverAnchorKind(lever) === "place"
            ? PlaceFilledIcon
            : TransitionFilledIcon,
        selectionItem:
          name === null
            ? { type: "controller", id: controller.id }
            : {
                type: leverAnchorKind(lever),
                id: leverAnchorId(lever),
              },
        tag: leverKindLabel[lever.kind],
        indent: 1,
      };
    }),
  ]);

  return {
    id: "group-controllers",
    name: "Controllers",
    emptyGroupMessage: "No controllers",
    renderGroupAction: addAction(AddControllerAction),
    children,
  };
};
