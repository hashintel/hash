import type { Story, StoryDefault } from "@ladle/react";

import { Switch, type SwitchProps } from "./switch";

export default {
  title: "Components/Switch",
  parameters: {
    layout: "centered",
  },
} satisfies StoryDefault<SwitchProps>;

/**
 * The default Switch component with standard settings.
 * Try dragging the Switch thumb or clicking to switch states.
 * Use the Controls panel below to adjust visual parameters.
 */
export const Default: Story<SwitchProps> = (args) => <Switch {...args} />;
