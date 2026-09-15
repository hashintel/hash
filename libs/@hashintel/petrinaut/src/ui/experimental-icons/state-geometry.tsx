import { css } from "@hashintel/ds-helpers/css";

const menuStyle = css({
  "--menu-open": "0",
  '&[data-open="true"], button[aria-expanded="true"] &': { "--menu-open": "1" },
});

export const MenuGeometry = ({
  open,
  transition,
}: {
  open: boolean;
  transition: string;
}) => (
  <g className={menuStyle} data-open={open} fill="none">
    <path
      d="M5 6h14"
      style={{
        transform:
          "translateY(calc(var(--menu-open) * 6px)) rotate(calc(var(--menu-open) * 45deg))",
        transformOrigin: "12px 6px",
        transition,
      }}
    />
    <path
      d="M5 12h14"
      style={{ opacity: "calc(1 - var(--menu-open))", transition }}
    />
    <path
      d="M5 18h14"
      style={{
        transform:
          "translateY(calc(var(--menu-open) * -6px)) rotate(calc(var(--menu-open) * -45deg))",
        transformOrigin: "12px 18px",
        transition,
      }}
    />
  </g>
);

export const PauseGeometry = () => (
  <>
    <rect x="5.5" y="4" width="4" height="16" rx="1" />
    <rect x="14.5" y="4" width="4" height="16" rx="1" />
  </>
);

export const PlaybackGeometry = ({
  playing,
  transition,
}: {
  playing: boolean;
  transition: string;
}) => (
  <g fill="currentColor">
    <path
      data-icon-part="play"
      d="M7 4.5 20 12 7 19.5Z"
      style={{
        opacity: playing ? 0 : 1,
        transform: playing ? "scale(0.85)" : "scale(1)",
        transformOrigin: "12px 12px",
        transition,
      }}
    />
    <g
      data-icon-part="pause"
      style={{
        opacity: playing ? 1 : 0,
        transform: playing ? "scale(1)" : "scale(0.85)",
        transformOrigin: "12px 12px",
        transition,
      }}
    >
      <PauseGeometry />
    </g>
  </g>
);

export type ExperimentalIconStatus = "valid" | "warning" | "error";

const diagnosticStrokes = {
  valid: [
    { id: "leading", x: 5, y: 12, angle: 45, length: Math.hypot(4.5, 4.5) },
    {
      id: "trailing",
      x: 9.5,
      y: 16.5,
      angle: -45,
      length: Math.hypot(9.5, 9.5),
    },
  ],
  warning: [
    { id: "leading", x: 12, y: 5, angle: 90, length: 9 },
    { id: "trailing", x: 12, y: 19, angle: -90, length: 0.01 },
  ],
  error: [
    { id: "leading", x: 6, y: 6, angle: 45, length: Math.hypot(12, 12) },
    { id: "trailing", x: 6, y: 18, angle: -45, length: Math.hypot(12, 12) },
  ],
} satisfies Record<
  ExperimentalIconStatus,
  {
    id: "leading" | "trailing";
    x: number;
    y: number;
    angle: number;
    length: number;
  }[]
>;

export const DiagnosticsGeometry = ({
  status,
  transition,
}: {
  status: ExperimentalIconStatus;
  transition: string;
}) => (
  <g fill="none">
    {diagnosticStrokes[status].map((stroke) => (
      <path
        key={stroke.id}
        data-icon-part="diagnostic-stroke"
        d="M0 0h20"
        style={{
          transform: `translate(${stroke.x}px, ${stroke.y}px) rotate(${stroke.angle}deg)`,
          transformOrigin: "0px 0px",
          strokeDasharray: `${stroke.length} 24`,
          transition,
        }}
      />
    ))}
  </g>
);

export const MicrophoneGeometry = ({
  muted,
  transition,
}: {
  muted: boolean;
  transition: string;
}) => (
  <g fill="none">
    <g style={{ opacity: muted ? 0.55 : 1, transition }}>
      <rect x="8" y="3" width="8" height="12" rx="4" />
      <path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8" />
    </g>
    <path
      data-icon-part="mute"
      d="m3 3 18 18"
      pathLength="1"
      strokeDasharray="1"
      style={{
        strokeDashoffset: muted ? 0 : 1,
        opacity: muted ? 1 : 0,
        transition,
      }}
    />
  </g>
);
