import type { RequireExactlyOne } from "type-fest";

type Direction = "bottom" | "top" | "left" | "right";
type Position = Direction | `${Direction}-${'start' | 'end'}`;

export const Tooltip = ({
  ...props,
}: {
  className?: string;
  /** The tooltip trigger */
  children: React.ReactNode;
  /** The content that triggers the tooltip */
  content: React.ReactNode;
  /** The preferred position of the tooltip - depending on the viewport, trigger and content another position may be chosen for better fit */
  position?: Position;
  /** Whether to display a light or dark tooltip */
  variant?: 'light' | 'dark';
  /** Whether to disable the tooltip */
  disableTooltip?: boolean;
  /** How long before the the tooltip is opened on hover/focus */
  openDelayMs?: number;
  /** How long before the the tooltip is opened when leaving hover/focus */
  closeDelayMs?: number;
  /** The X distance the tooltip will be from the trigger in px */
  offsetX?: number;
  /** The Y distance the tooltip will be from the trigger in px */
  offsetY?: number;
  onOpen?: () => void;
  onClose?: () => void;
} & RequireExactlyOne<{
  content: string;
  /** Whether the tooltip content should act as the accessible description for the content */
  describeChild: true;
} | {
  describeChild?: false;
}>) => {
  return <></>;
}
