import type { Meta, StoryFn } from "@storybook/react";
import { useState } from "react";

import { BlockSettingsButton } from "./block-settings-button";

const meta = {
  title: "Block Design System/Block Settings Button",
  component: BlockSettingsButton,
  tags: ["docsPage"],
} satisfies Meta<typeof BlockSettingsButton>;

export default meta;
type Story = StoryFn<typeof meta>;

export const Defaults: Story = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <BlockSettingsButton
      expanded={expanded}
      onClick={() => setExpanded(!expanded)}
    />
  );
};
