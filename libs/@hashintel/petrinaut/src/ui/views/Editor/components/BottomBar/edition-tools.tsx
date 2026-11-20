import { use } from "react";

import { Icon, type MenuItem, Menu } from "@hashintel/ds-components";
import { sameComponent } from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../react/state/active-net-context";
import {
  useEditorActions,
  useEditorFields,
  useEditorState,
} from "../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { useComposesOnly } from "../../../../../react/state/use-composes-only";
import { useIsCompositionInterfaceOn } from "../../../../../react/state/use-is-composition-interface-on";
import { useIsReadOnly } from "../../../../../react/state/use-is-read-only";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import {
  AddPlaceIcon,
  AddTransitionIcon,
} from "../../../../experimental-icons";
import { writeDraggedNodeKind } from "../../../shared/canvas-node-drag";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";
import { ToolbarMenuTrigger } from "./toolbar-menu-trigger";

/** Picks which component the next component instance comes from. */
const ComponentDropdown = () => {
  const {
    petriNetDefinition: { components },
  } = use(SDCPNContext);
  const { editionMode, componentToAdd } = useEditorFields(
    "editionMode",
    "componentToAdd",
  );
  const { setAddComponentMode } = useEditorActions();

  const items: MenuItem[] = (components ?? []).map((component) => ({
    id: component.id,
    icon: "cube",
    text: component.name,
    selected:
      editionMode === "add-component" &&
      componentToAdd !== null &&
      sameComponent(componentToAdd, { id: component.id }),
    onClick: () => setAddComponentMode({ id: component.id }),
  }));

  if (items.length === 0) {
    items.push({
      id: "empty",
      text: "No components defined",
      disabled: true,
      onClick: () => {},
    });
  }

  return (
    <Menu
      trigger={
        <ToolbarMenuTrigger
          icon="cube"
          isActive={editionMode === "add-component" && componentToAdd !== null}
          aria-label="Add component"
        />
      }
      items={items}
      position="top"
    />
  );
};

/**
 * The tools that add nodes to the net. Nothing to offer on a read-only net,
 * where every one of them is refused, nor in an editor that only composes:
 * what it places comes from the Components panel.
 */
export const EditionTools = () => {
  const editionMode = useEditorState((editor) => editor.editionMode);
  const { setEditionMode } = useEditorActions();
  const isReadOnly = useIsReadOnly();
  const { activeComponentId } = use(ActiveNetContext);
  const isRootNet = activeComponentId === null;
  const composesOnly = useComposesOnly();
  const isCompositionInterfaceOn = useIsCompositionInterfaceOn();
  const { enableExperimentalIconPack } = use(UserSettingsContext);

  if (isReadOnly || composesOnly) {
    return null;
  }

  return (
    <>
      <ToolbarDivider />
      <ToolbarButton
        tooltip="Add Place"
        shortcut="n"
        onClick={() => setEditionMode("add-place")}
        isSelected={editionMode === "add-place"}
        ariaLabel="Add place mode"
        draggable
        onDragStart={(event) => {
          // eslint-disable-next-line no-param-reassign
          event.dataTransfer.effectAllowed = "move";
          writeDraggedNodeKind(event.dataTransfer, "place");
        }}
      >
        {enableExperimentalIconPack ? (
          <AddPlaceIcon
            selected={editionMode === "add-place"}
            variant={editionMode === "add-place" ? "filled" : "outline"}
            effect={editionMode === "add-place" ? "bounce" : undefined}
            trigger={editionMode}
            transition="spring"
            duration={420}
          />
        ) : (
          <Icon name="circlePlus" />
        )}
      </ToolbarButton>
      <ToolbarButton
        tooltip="Add Transition"
        shortcut="t"
        onClick={() => setEditionMode("add-transition")}
        isSelected={editionMode === "add-transition"}
        ariaLabel="Add transition mode"
        draggable
        onDragStart={(event) => {
          // eslint-disable-next-line no-param-reassign
          event.dataTransfer.effectAllowed = "move";
          writeDraggedNodeKind(event.dataTransfer, "transition");
        }}
      >
        {enableExperimentalIconPack ? (
          <AddTransitionIcon
            selected={editionMode === "add-transition"}
            variant={editionMode === "add-transition" ? "filled" : "outline"}
            effect={editionMode === "add-transition" ? "bounce" : undefined}
            trigger={editionMode}
            transition="spring"
            duration={420}
          />
        ) : (
          <Icon name="squarePlus" />
        )}
      </ToolbarButton>
      {isRootNet && isCompositionInterfaceOn && <ComponentDropdown />}
    </>
  );
};
