import { use } from "react";

import { Button, HelpTooltip, Icon, Toggle } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import {
  generatePetrinautId,
  libraryComponentSubnetId,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { usePluginComponentLibraries } from "../../../../../plugins/plugins-provider";
import { useEnsureLibraryComponent } from "../../../../../plugins/use-ensure-library-component";
import {
  draggedComponentKind,
  draggedLibraryComponentKind,
  writeDraggedNodeKind,
} from "../../../../shared/canvas-node-drag";
import { usePetrinautPresentation } from "../../../../shared/presentation-context";

import type { SubView } from "../../../../../components/sub-view/types";
import type {
  ComponentLibrary,
  LibraryComponent,
  Subnet,
} from "@hashintel/petrinaut-core";

const panelStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const toggleRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  fontSize: "sm",
  color: "neutral.s115",
});

const toggleLabelStyle = css({
  flex: "[1]",
  minWidth: "[0]",
});

const groupTitleStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "wide",
  color: "neutral.s85",
  paddingTop: "1",
});

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  mx: "-1",
});

const rowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1.5",
    minHeight: "8",
    p: "1",
    borderRadius: "lg",
    fontSize: "sm",
    fontWeight: "medium",
    color: "neutral.s115",
    cursor: "grab",
    border: "none",
    width: "full",
    textAlign: "left",
    background: "[transparent]",
    transition: "[background-color 100ms ease-out]",
    _hover: { backgroundColor: "neutral.bg.surface.hover" },
    _focusVisible: { outline: "none", backgroundColor: "neutral.s25" },
  },
  variants: {
    armed: {
      true: {
        backgroundColor: "blue.s30",
        _hover: { backgroundColor: "blue.s40" },
      },
    },
  },
});

const rowIconStyle = css({
  flexShrink: 0,
  display: "flex",
  color: "neutral.s70",
});

const rowTextStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  display: "flex",
  flexDirection: "column",
});

const rowNameStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const rowDetailStyle = css({
  fontSize: "xs",
  fontWeight: "normal",
  color: "neutral.s85",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const emptyStyle = css({
  fontSize: "sm",
  color: "neutral.s65",
  px: "1",
});

const hintStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
  px: "1",
});

const portSummary = (subnet: Pick<Subnet, "places">): string => {
  const ports = subnet.places.filter((place) => place.isPort);
  return ports.length === 0
    ? "no ports"
    : `ports: ${ports.map((place) => place.name).join(", ")}`;
};

/**
 * One component the user can instantiate: a click arms the add-component
 * mode for it, so the next click on the canvas places an instance; a drag
 * drops one where it lands.
 */
export const ComponentRow = ({
  subnet,
  armed,
  onArm,
}: {
  subnet: Subnet;
  armed: boolean;
  onArm: () => void;
}) => {
  const isReadOnly = useIsReadOnly();

  return (
    <button
      type="button"
      className={rowStyle({ armed })}
      aria-pressed={armed}
      disabled={isReadOnly}
      draggable={!isReadOnly}
      onClick={onArm}
      onDragStart={(event) => {
        // eslint-disable-next-line no-param-reassign
        event.dataTransfer.effectAllowed = "move";
        writeDraggedNodeKind(
          event.dataTransfer,
          draggedComponentKind(subnet.id),
        );
      }}
      title={subnet.description ?? subnet.name}
    >
      <span className={rowIconStyle}>
        <Icon name="cube" size="xs" />
      </span>
      <span className={rowTextStyle}>
        <span className={rowNameStyle}>{subnet.name}</span>
        <span className={rowDetailStyle}>{portSummary(subnet)}</span>
      </span>
    </button>
  );
};

/**
 * One component of a plugin's library. Arming or dragging it copies the
 * component into the document the first time, as a subnet the next uses
 * share.
 */
const LibraryComponentRow = ({
  library,
  component,
  armed,
  onArm,
}: {
  library: ComponentLibrary;
  component: LibraryComponent;
  armed: boolean;
  onArm: () => void;
}) => {
  const isReadOnly = useIsReadOnly();

  return (
    <button
      type="button"
      className={rowStyle({ armed })}
      aria-pressed={armed}
      disabled={isReadOnly}
      draggable={!isReadOnly}
      onClick={onArm}
      onDragStart={(event) => {
        // eslint-disable-next-line no-param-reassign
        event.dataTransfer.effectAllowed = "move";
        writeDraggedNodeKind(
          event.dataTransfer,
          draggedLibraryComponentKind(library.id, component.id),
        );
      }}
      title={component.description ?? component.name}
    >
      <span className={rowIconStyle}>
        <Icon name="cube" size="xs" />
      </span>
      <span className={rowTextStyle}>
        <span className={rowNameStyle}>{component.name}</span>
        <span className={rowDetailStyle}>
          {component.description ?? portSummary(component.template)}
        </span>
      </span>
    </button>
  );
};

const LibrarySection = ({ library }: { library: ComponentLibrary }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const {
    editionMode,
    componentSubnetId,
    setAddComponentMode,
    setEditionMode,
  } = use(EditorContext);
  const ensureLibraryComponent = useEnsureLibraryComponent();
  const subnetIds = new Set(
    (petriNetDefinition.subnets ?? []).map(({ id }) => id),
  );

  return (
    <>
      <div className={groupTitleStyle}>{library.name}</div>
      <div className={listStyle}>
        {library.components.map((component) => {
          const subnetId = libraryComponentSubnetId(library.id, component.id);
          const armed =
            editionMode === "add-component" &&
            componentSubnetId === subnetId &&
            subnetIds.has(subnetId);
          return (
            <LibraryComponentRow
              key={component.id}
              library={library}
              component={component}
              armed={armed}
              onArm={() => {
                if (armed) {
                  setEditionMode("cursor");
                  return;
                }
                const subnet = ensureLibraryComponent({
                  libraryId: library.id,
                  componentId: component.id,
                });
                if (subnet) {
                  setAddComponentMode(subnet.id);
                }
              }}
            />
          );
        })}
      </div>
    </>
  );
};

const ComponentsOnlyToggle: React.FC = () => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { setComponentsOnly } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  return (
    <div className={toggleRowStyle}>
      <span className={toggleLabelStyle}>Components only</span>
      <HelpTooltip content="Build the root net from component instances and fusions alone: the place and transition tools go away, and places or transitions it still holds are reported in Diagnostics." />
      <Toggle
        size="sm"
        aria-label="Components only"
        value={petriNetDefinition.componentsOnly === true}
        disabled={isReadOnly}
        onChange={(componentsOnly) => setComponentsOnly({ componentsOnly })}
      />
    </div>
  );
};

const ComponentsPanelContent: React.FC = () => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { activeSubnetId } = use(ActiveNetContext);
  const {
    editionMode,
    componentSubnetId,
    setAddComponentMode,
    setEditionMode,
  } = use(EditorContext);
  const presentation = usePetrinautPresentation();
  const libraries = usePluginComponentLibraries();
  // A subnet cannot hold an instance of itself.
  const subnets = (petriNetDefinition.subnets ?? []).filter(
    ({ id }) => id !== activeSubnetId,
  );

  return (
    <div className={panelStyle}>
      {presentation.showMutationActions && activeSubnetId === null && (
        <ComponentsOnlyToggle />
      )}
      <div className={groupTitleStyle}>In this document</div>
      {subnets.length === 0 ? (
        <div className={emptyStyle}>
          No components yet. Add one, draw it in its own net and mark its
          boundary places as ports.
        </div>
      ) : (
        <div className={listStyle}>
          {subnets.map((subnet) => {
            const armed =
              editionMode === "add-component" &&
              componentSubnetId === subnet.id;
            return (
              <ComponentRow
                key={subnet.id}
                subnet={subnet}
                armed={armed}
                onArm={() =>
                  armed
                    ? setEditionMode("cursor")
                    : setAddComponentMode(subnet.id)
                }
              />
            );
          })}
        </div>
      )}
      {libraries.map((library) => (
        <LibrarySection key={library.id} library={library} />
      ))}
      {(subnets.length > 0 || libraries.length > 0) && (
        <div className={hintStyle}>
          Click a component, then click the canvas to place an instance, or drag
          it onto the canvas. Drag between ports and places to fuse them.
        </div>
      )}
    </div>
  );
};

const AddComponentAction: React.FC = () => {
  const {
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);
  const { setActiveSubnetId } = use(ActiveNetContext);
  const { addSubnet } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label="New component"
      size="xs"
      variant="ghost"
      iconName="plus"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "New component"}
      onClick={() => {
        const id = generatePetrinautId();
        addSubnet({
          id,
          name: `Component ${(subnets ?? []).length + 1}`,
          places: [],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
          componentInstances: [],
        });
        setActiveSubnetId(id);
      }}
    />
  );
};

export const componentsSubView: SubView = {
  id: "components",
  title: "Components",
  tooltip:
    "The components this net can be composed from. Place instances on the canvas and fuse their ports with places or with each other.",
  component: ComponentsPanelContent,
  renderHeaderAction: () => <AddComponentAction />,
  headerActionMutates: true,
  defaultCollapsed: false,
};
