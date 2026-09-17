import { use } from "react";

import { Icon, type MenuItem, Menu } from "@hashintel/ds-components";

import { ActiveNetContext } from "../../../../../react/state/active-net-context";
import {
  EditorContext,
  type EditorState,
} from "../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
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

type EditorEditionMode = EditorState["editionMode"];

/** Picks which subnet the next component instance comes from. */
const ComponentDropdown: React.FC<{
  editionMode: EditorEditionMode;
}> = ({ editionMode }) => {
  const {
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);
  const { componentSubnetId, setAddComponentMode } = use(EditorContext);

  const items: MenuItem[] = (subnets ?? []).map((subnet) => ({
    id: subnet.id,
    icon: "cube",
    text: subnet.name,
    selected:
      editionMode === "add-component" && componentSubnetId === subnet.id,
    onClick: () => setAddComponentMode(subnet.id),
  }));

  if (items.length === 0) {
    items.push({
      id: "empty",
      text: "No subnets defined",
      disabled: true,
      onClick: () => {},
    });
  }

  return (
    <Menu
      trigger={
        <ToolbarMenuTrigger
          icon="cube"
          isActive={
            editionMode === "add-component" && componentSubnetId !== null
          }
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
 * where every one of them is refused.
 */
export const EditionTools: React.FC<{
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
}> = ({ editionMode, onEditionModeChange }) => {
  const isReadOnly = useIsReadOnly();
  const { activeSubnetId } = use(ActiveNetContext);
  const isRootNet = activeSubnetId === null;
  const { extensions } = use(SDCPNContext);
  const { enableNetComponents, enableExperimentalIconPack } =
    use(UserSettingsContext);

  if (isReadOnly) {
    return null;
  }

  return (
    <>
      <ToolbarDivider />
      <ToolbarButton
        tooltip="Add Place"
        shortcut="n"
        onClick={() => onEditionModeChange("add-place")}
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
        onClick={() => onEditionModeChange("add-transition")}
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
      {isRootNet && extensions.subnets && enableNetComponents && (
        <ComponentDropdown editionMode={editionMode} />
      )}
    </>
  );
};
