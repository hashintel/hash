import { Switch as DsSwitch, Tooltip } from "@hashintel/ds-components";

import type { ComponentProps } from "react";

type SwitchProps = ComponentProps<typeof DsSwitch> & {
  tooltip?: string;
  tooltipOptions?: Omit<ComponentProps<typeof Tooltip>, "children" | "content">;
};

export const Switch = ({ tooltip, tooltipOptions, ...props }: SwitchProps) => {
  const element = <DsSwitch {...props} />;

  if (!tooltip) {
    return element;
  }

  return (
    <Tooltip {...tooltipOptions} content={tooltip}>
      {element}
    </Tooltip>
  );
};
