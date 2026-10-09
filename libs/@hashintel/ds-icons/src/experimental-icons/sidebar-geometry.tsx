import { css } from "@hashintel/ds-helpers/css";

import { IconMotionLayer } from "./shared/icon-motion-layer";

const sidebarStyle = css({
  "--sidebar-divider-offset": "1px",
  "--sidebar-divider-scale": "1",
  "--sidebar-divider-width-scale": "1",
  "--sidebar-panel-scale": "1.166667",
  '&[data-collapsed="true"]': {
    "--sidebar-divider-offset": "-2.5px",
    "--sidebar-divider-scale": "0.6875",
    "--sidebar-divider-width-scale": "0.75",
    "--sidebar-panel-scale": "0",
  },
  '&[data-hover-motion="auto"][data-collapsed="false"]:is(svg:hover *, button:hover *)':
    {
      "--sidebar-divider-offset": "0.25px",
      "--sidebar-panel-scale": "1.041667",
    },
  '&[data-hover-motion="auto"][data-collapsed="true"]:is(svg:hover *, button:hover *)':
    {
      "--sidebar-divider-offset": "-1px",
      "--sidebar-divider-scale": "0.625",
      "--sidebar-divider-width-scale": "1",
    },
});

export const SidebarGeometry = ({
  collapsed,
  filled,
  motionAllowed,
  transition,
}: {
  collapsed: boolean;
  filled: boolean;
  motionAllowed: boolean;
  transition: string;
}) => (
  <g
    className={sidebarStyle}
    data-collapsed={collapsed}
    data-hover-motion={motionAllowed ? "auto" : "none"}
  >
    <IconMotionLayer name="panel">
      <path
        data-icon-part="panel"
        d="M5 4h4v16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        fill="currentColor"
        stroke="none"
        style={{
          transform: "scaleX(var(--sidebar-panel-scale))",
          transformOrigin: "3px 12px",
          opacity: filled && !collapsed ? 1 : 0,
          transition,
        }}
      />
      <path
        data-icon-part="divider"
        d="M9 4v16"
        fill="none"
        style={{
          transform:
            "translateX(var(--sidebar-divider-offset)) scale(var(--sidebar-divider-width-scale), var(--sidebar-divider-scale))",
          transformOrigin: "9px 12px",
          transition,
        }}
      />
    </IconMotionLayer>
    <IconMotionLayer name="frame">
      <rect x="3" y="4" width="18" height="16" rx="2" fill="none" />
    </IconMotionLayer>
  </g>
);
