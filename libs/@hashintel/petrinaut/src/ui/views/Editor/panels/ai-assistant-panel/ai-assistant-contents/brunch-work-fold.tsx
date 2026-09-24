import { Collapsible } from "@ark-ui/react/collapsible";
import { type ReactNode, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { collapsibleContentStyle } from "./shared/collapsible-content-style";
import { useElapsedTime } from "./shared/use-elapsed-time";

export type BrunchWorkStatus = "streaming" | "settled" | "approval" | "stopped";

const foldStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "[0]",
});
const triggerStyle = css({
  display: "inline-flex",
  alignSelf: "flex-start",
  alignItems: "center",
  gap: "1",
  padding: "[2px 6px 2px 2px]",
  borderRadius: "md",
  _hover: { backgroundColor: "neutral.a20" },
  fontSize: "[13px]",
  fontWeight: "medium",
  color: "neutral.s100",
  textAlign: "left",
  cursor: "pointer",
  "& [data-chevron]": {
    transition: "[transform 150ms ease]",
  },
  "&[data-state=closed] [data-chevron]": { transform: "[rotate(90deg)]" },
  "&[data-state=open] [data-chevron]": { transform: "[rotate(180deg)]" },
  "&[data-working=true] [data-label]": {
    backgroundImage:
      "[linear-gradient(110deg, {colors.neutral.s100} 35%, {colors.neutral.s60} 50%, {colors.neutral.s100} 65%)]",
    backgroundSize: "[200% 100%]",
    backgroundClip: "text",
    color: "[transparent]",
    animation: "[shimmer 2.4s linear infinite]",
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  },
});

export const BrunchWorkFold = ({
  status,
  elapsedMs,
  children,
}: {
  status: BrunchWorkStatus;
  elapsedMs?: number;
  children: ReactNode;
}) => {
  const observedElapsed = useElapsedTime(status === "streaming");
  const duration = observedElapsed ?? elapsedMs;
  const defaultOpen = status !== "settled";
  const [disclosure, setDisclosure] = useState({ status, open: defaultOpen });
  // Reset only on a lifecycle transition, not on each streamed delta.
  if (disclosure.status !== status)
    setDisclosure({ status, open: defaultOpen });
  const label =
    status === "streaming"
      ? "Working…"
      : status === "approval"
        ? "Approval required"
        : status === "stopped"
          ? "Stopped"
          : duration === undefined
            ? "Activity"
            : `Activity · ${Math.floor(duration / 1_000)}s`;
  return (
    <Collapsible.Root
      className={foldStyle}
      open={disclosure.open}
      onOpenChange={({ open }) => setDisclosure({ status, open })}
      data-work-status={status}
    >
      <Collapsible.Trigger asChild>
        <Button
          size="xs"
          variant="ghost"
          className={triggerStyle}
          data-working={status === "streaming"}
        >
          <Icon name="sparkles" size="sm" />
          <span data-label>{label}</span>
          <Icon name="chevronUp" size="sm" data-chevron />
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content className={collapsibleContentStyle}>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2",
            margin: "[4px 0 2px 5px]",
            paddingLeft: "3",
            borderLeft: "[2px solid {colors.neutral.a30}]",
          })}
        >
          {children}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
