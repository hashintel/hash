import { HelpTooltip } from "./help-tooltip";

import type { Story, StoryDefault } from "@ladle/react";

type HelpTooltipProps = React.ComponentProps<typeof HelpTooltip>;

const aligns = ["top", "center"] as const satisfies readonly NonNullable<
  HelpTooltipProps["align"]
>[];

export default {
  title: "Components/HelpTooltip",
} satisfies StoryDefault;

export const Default: Story = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
    {aligns.map((align) => (
      <div key={align}>
        <h3 style={{ marginBottom: 12 }}>align=&quot;{align}&quot;</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ fontSize: 13 }}>
            Small text
            <HelpTooltip align={align} content="More information" />
          </span>
          <span style={{ fontSize: 28 }}>
            Large text
            <HelpTooltip align={align} content="More information" />
          </span>
        </div>
      </div>
    ))}
  </div>
);
