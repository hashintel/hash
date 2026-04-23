import { css, cva } from "@hashintel/ds-helpers/css";
import { use } from "react";
import { LuNetwork } from "react-icons/lu";
import { TbPlus } from "react-icons/tb";
import { v4 as uuidv4 } from "uuid";

import { IconButton } from "../../../../../components/icon-button";
import type { SubView } from "../../../../../components/sub-view/types";
import { UI_MESSAGES } from "../../../../../constants/ui-messages";
import { ActiveNetContext } from "../../../../../state/active-net-context";
import { EditorContext } from "../../../../../state/editor-context";
import { MutationContext } from "../../../../../state/mutation-context";
import { SDCPNContext } from "../../../../../state/sdcpn-context";
import { useIsReadOnly } from "../../../../../state/use-is-read-only";

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
  color: "[#9ca3af]",
});

const ICON_SIZE = 12;

const NetsHeaderAction: React.FC = () => {
  const {
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);
  const { addSubnet } = use(MutationContext);
  const isReadOnly = useIsReadOnly();

  const handleAddSubnet = () => {
    const count = (subnets ?? []).length;
    addSubnet({
      id: uuidv4(),
      name: `Subnet ${count + 1}`,
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    });
  };

  return (
    <IconButton
      aria-label="Add subnet"
      size="xs"
      disabled={isReadOnly}
      tooltip={isReadOnly ? UI_MESSAGES.READ_ONLY_MODE : undefined}
      onClick={handleAddSubnet}
    >
      <TbPlus />
    </IconButton>
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
    <div className={listStyle}>
      <div
        className={itemStyle({ active: activeSubnetId === null })}
        onClick={() => handleSelect(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleSelect(null);
          }
        }}
        role="option"
        aria-selected={activeSubnetId === null}
        tabIndex={0}
      >
        <span className={iconStyle}>
          <LuNetwork size={ICON_SIZE} />
        </span>
        Root
      </div>
      {(subnets ?? []).map((subnet) => (
        <div
          key={subnet.id}
          className={itemStyle({ active: activeSubnetId === subnet.id })}
          onClick={() => handleSelect(subnet.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleSelect(subnet.id);
            }
          }}
          role="option"
          aria-selected={activeSubnetId === subnet.id}
          tabIndex={0}
        >
          <span className={iconStyle}>
            <LuNetwork size={ICON_SIZE} />
          </span>
          {subnet.name}
        </div>
      ))}
    </div>
  );
};

/**
 * SubView definition for the Nets list.
 * Shows the root net and any subnets defined in the SDCPN.
 */
export const netsListSubView: SubView = {
  id: "nets-list",
  title: "Nets",
  tooltip:
    "View the root net and its subnets. Subnets are isolated sub-networks within the net.",
  component: NetsListContent,
  renderHeaderAction: () => <NetsHeaderAction />,
  defaultCollapsed: false,
};
