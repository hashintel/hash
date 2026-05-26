import { use } from "react";
import { v4 as generateUuid } from "uuid";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { usePetrinautMutations } from "../../../../../../react";
import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { Button } from "../../../../../components/button";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";

import type { SubView } from "../../../../../components/sub-view/types";

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  mx: "-1",
});

const itemStyle = cva({
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
    cursor: "pointer",
    transition: "[background-color 100ms ease-out]",
    _hover: {
      backgroundColor: "neutral.bg.surface.hover",
    },
  },
  variants: {
    active: {
      true: {
        backgroundColor: "blue.s30",
        fontWeight: "semibold",
        _hover: {
          backgroundColor: "blue.s40",
        },
      },
    },
  },
});

const iconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s70",
});

const NetsHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);
  const { addSubnet } = usePetrinautMutations();
  const isReadOnly = useIsReadOnly();

  return (
    <Button
      aria-label="Add subnet"
      size="xs"
      variant="ghost"
      iconName="plus"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : "Add subnet"}
      tooltipDisplay="inline"
      onClick={() => {
        const count = (subnets ?? []).length;
        addSubnet({
          id: `subnet__${generateUuid()}`,
          name: `Subnet ${count + 1}`,
          places: [],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
          componentInstances: [],
        });
      }}
    />
  );
};

const NetsListContent: React.FC = () => {
  const {
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);
  const { activeSubnetId, setActiveSubnetId } = use(ActiveNetContext);
  const { clearSelection } = use(EditorContext);

  const handleSelect = (subnetId: string | null) => {
    setActiveSubnetId(subnetId);
    clearSelection();
  };

  return (
    <div className={listStyle} role="listbox" aria-label="Nets">
      <div
        className={itemStyle({ active: activeSubnetId === null })}
        onClick={() => handleSelect(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            handleSelect(null);
          }
        }}
        role="option"
        aria-selected={activeSubnetId === null}
        tabIndex={0}
      >
        <span className={iconStyle}>
          <Icon name="diagramProject" size="xs" />
        </span>
        Root
      </div>
      {(subnets ?? []).map((subnet) => (
        <div
          key={subnet.id}
          className={itemStyle({ active: activeSubnetId === subnet.id })}
          onClick={() => handleSelect(subnet.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              handleSelect(subnet.id);
            }
          }}
          role="option"
          aria-selected={activeSubnetId === subnet.id}
          tabIndex={0}
        >
          <span className={iconStyle}>
            <Icon name="diagramNested" size="xs" />
          </span>
          {subnet.name}
        </div>
      ))}
    </div>
  );
};

export const netsListSubView: SubView = {
  id: "nets-list",
  title: "Nets",
  tooltip:
    "View the root net and reusable subnets. Mark subnet places as ports, then instantiate subnets as components in the root net.",
  component: NetsListContent,
  renderHeaderAction: () => <NetsHeaderAction />,
  defaultCollapsed: false,
};
