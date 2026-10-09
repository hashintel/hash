import { IconMotionLayer } from "./shared/icon-motion-layer";

export const SettingsGeometry = ({
  open,
  transition,
}: {
  open: boolean;
  transition: string;
}) => (
  <IconMotionLayer name="whole">
    <g
      data-icon-part="gear"
      data-open={open}
      style={{
        transform: open ? "rotate(30deg)" : "rotate(0deg)",
        transformOrigin: "12px 12px",
        transition,
      }}
    >
      <path
        fillRule="evenodd"
        strokeLinejoin="miter"
        d="M10.44 3.14h3.12l.54 2.18 2.63 1.52 2.16-.63 1.57 2.71-1.63 1.56v3.04l1.63 1.56-1.57 2.71-2.16-.63-2.63 1.52-.54 2.18h-3.12l-.54-2.18-2.63-1.52-2.16.63-1.57-2.71 1.63-1.56v-3.04L3.54 8.92l1.57-2.71 2.16.63L9.9 5.32Z M15 12a3 3 0 1 0-6 0a3 3 0 1 0 6 0Z"
      />
    </g>
  </IconMotionLayer>
);
