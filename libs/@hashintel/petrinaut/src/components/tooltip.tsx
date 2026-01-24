import { Tooltip as ArkTooltip } from "@ark-ui/react/tooltip";
import { css } from "@hashintel/ds-helpers/css";
import type { SvgIconProps } from "@mui/material";
import { SvgIcon, Tooltip as MuiTooltip } from "@mui/material";
import type { FunctionComponent, ReactNode } from "react";

const tooltipContentStyle = css({
  backgroundColor: "gray.90",
  color: "gray.10",
  borderRadius: "md.6",
  fontSize: "[13px]",
  zIndex: "[10000]",
  boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.15)]",
  padding: "[6px 10px]",
});

interface TooltipProps {
  /**
   * The tooltip content. When empty/undefined, children are rendered without tooltip wrapper.
   */
  content?: string;
  children: ReactNode;
}

const triggerWrapperStyle = css({
  display: "inline-flex",
  alignItems: "center",
});

/**
 * Tooltip component that wraps children and shows a tooltip on hover.
 *
 * Uses a wrapper div with inline-flex to ensure tooltips work on disabled elements
 * and preserve the natural dimensions of input elements.
 */
export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  if (!content) {
    return children;
  }

  return (
    <ArkTooltip.Root
      openDelay={200}
      closeDelay={0}
      positioning={{ placement: "top" }}
    >
      {/* Wrapper div with inline-flex preserves input dimensions while enabling tooltips on disabled elements */}
      <ArkTooltip.Trigger asChild>
        <div className={triggerWrapperStyle}>{children}</div>
      </ArkTooltip.Trigger>
      <ArkTooltip.Positioner>
        <ArkTooltip.Content className={tooltipContentStyle}>
          {content}
        </ArkTooltip.Content>
      </ArkTooltip.Positioner>
    </ArkTooltip.Root>
  );
};

const CircleInfoIcon: FunctionComponent<SvgIconProps> = (props) => {
  return (
    <SvgIcon
      {...props}
      width="512"
      height="512"
      viewBox="0 0 512 512"
      fill="none"
    >
      <path d="M256 0C114.6 0 0 114.6 0 256s114.6 256 256 256s256-114.6 256-256S397.4 0 256 0zM256 464c-114.7 0-208-93.31-208-208S141.3 48 256 48s208 93.31 208 208S370.7 464 256 464zM296 336h-16V248C280 234.8 269.3 224 256 224H224C210.8 224 200 234.8 200 248S210.8 272 224 272h8v64h-16C202.8 336 192 346.8 192 360S202.8 384 216 384h80c13.25 0 24-10.75 24-24S309.3 336 296 336zM256 192c17.67 0 32-14.33 32-32c0-17.67-14.33-32-32-32S224 142.3 224 160C224 177.7 238.3 192 256 192z" />
    </SvgIcon>
  );
};

export const InfoIconTooltip = ({ tooltip }: { tooltip: string }) => {
  return (
    <MuiTooltip
      title={tooltip}
      placement="top"
      componentsProps={{
        tooltip: {
          sx: {
            background: "rgb(23, 23, 23)",
            fontSize: 13,
            borderRadius: "12px",
            px: "10px",
            py: "6px",
          },
        },
      }}
    >
      <CircleInfoIcon
        sx={{ fontSize: 11, color: "rgb(160, 160, 160)", ml: 0.8, mb: 0.2 }}
      />
    </MuiTooltip>
  );
};
