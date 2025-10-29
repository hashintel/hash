import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { css } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  return (
    <ArkTooltip.Root
      openDelay={200}
      closeDelay={0}
      positioning={{ placement: "top" }}
    >
      <ArkTooltip.Trigger asChild>{children}</ArkTooltip.Trigger>
      <ArkTooltip.Positioner>
        <ArkTooltip.Content
          className={css({
            backgroundColor: "core.gray.90",
            color: "core.gray.10",
            borderRadius: "radius.6",
            fontSize: "[13px]",
            whiteSpace: "nowrap",
            zIndex: "[10000]",
            boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.15)]",
          })}
          style={{
            padding: "6px 10px",
          }}
        >
          <ArkTooltip.Arrow
            className={css({
              "--arrow-size": "[0px]",
              "--arrow-background": "{colors.core.gray.90}",
            })}
          >
            <ArkTooltip.ArrowTip />
          </ArkTooltip.Arrow>
          {content}
        </ArkTooltip.Content>
      </ArkTooltip.Positioner>
    </ArkTooltip.Root>
  );
};
