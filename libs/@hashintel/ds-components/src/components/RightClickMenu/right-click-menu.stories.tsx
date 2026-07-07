import { useMemo } from "react";

import { type MenuItem } from "../Menu/menu";
import { type ItemOrGroup } from "../Menu/SelectableList/selectable-list";
import { groupedItems } from "../Menu/SelectableList/selectable-list.fixtures";
import { RightClickMenu } from "./right-click-menu";

import type { Story, StoryDefault } from "@ladle/react";

type RightClickMenuProps = React.ComponentProps<typeof RightClickMenu>;

const positions = [
  "bottom",
  "bottom-start",
  "bottom-end",
  "top",
  "top-start",
  "top-end",
  "left",
  "left-start",
  "left-end",
  "right",
  "right-start",
  "right-end",
] as const;

export default {
  title: "Components/RightClickMenu",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    position: {
      control: { type: "select", options: positions },
    },
  },
  args: {
    position: "bottom-start",
  },
} satisfies StoryDefault<RightClickMenuProps>;

const dropTargetStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 320,
  height: 160,
  border: "2px dashed currentColor",
  borderRadius: 8,
  userSelect: "none",
};

export const Default: Story<RightClickMenuProps> = (args) => {
  const items = useMemo(() => groupedItems as Array<ItemOrGroup<MenuItem>>, []);
  return (
    <RightClickMenu {...args} items={items}>
      <div style={dropTargetStyle}>Right click anywhere in this area</div>
    </RightClickMenu>
  );
};
