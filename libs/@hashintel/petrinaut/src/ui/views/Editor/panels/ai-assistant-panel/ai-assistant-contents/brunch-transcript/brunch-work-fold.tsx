import { Collapsible } from "@ark-ui/react/collapsible";
import { type ReactNode, useState } from "react";

import { Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { collapsibleContentStyle } from "../shared/collapsible-content-style";
import { useElapsedTime } from "../shared/use-elapsed-time";

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
  border: "none",
  borderRadius: "md",
  backgroundColor: "[transparent]",
  _hover: { backgroundColor: "neutral.a20" },
  _focusVisible: { outline: "[2px solid {colors.blue.s90}]" },
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
  "&[data-pending]": {
    cursor: "default",
    _hover: { backgroundColor: "[transparent]" },
  },
});
const spinnerStyle = css({
  color: "blue.s90",
  flexShrink: 0,
  "@media (prefers-reduced-motion: reduce)": {
    animation: "[none !important]",
  },
});

const WorkIcon = ({ working }: { working: boolean }) =>
  working ? (
    <LoadingSpinner aria-hidden="true" size="xs" className={spinnerStyle} />
  ) : (
    <Icon name="sparkles" size="sm" />
  );

/** Stands where the Activity fold will appear until Brunch's first part arrives. */
export const BrunchWorkPending = ({ label }: { label: string }) => (
  <div className={foldStyle} data-work-status="pending">
    <span className={triggerStyle} data-working data-pending role="status">
      <WorkIcon working />
      <span data-label>{label}</span>
    </span>
  </div>
);

export const BrunchWorkFold = ({
  status,
  elapsedMs,
  preserveOpen = false,
  children,
}: {
  status: BrunchWorkStatus;
  elapsedMs?: number;
  preserveOpen?: boolean;
  children: ReactNode;
}) => {
  const observedElapsed = useElapsedTime(status === "streaming");
  const duration = observedElapsed ?? elapsedMs;
  const defaultOpen = status !== "settled";
  const [disclosure, setDisclosure] = useState({ status, open: defaultOpen });
  // Brunch keeps the reader's disclosure state across tool/text phases.
  // A new approval is the exception: it must reveal the decision controls.
  if (disclosure.status !== status)
    setDisclosure({
      status,
      open:
        preserveOpen && status !== "approval" ? disclosure.open : defaultOpen,
    });
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
      <Collapsible.Trigger
        className={triggerStyle}
        data-working={status === "streaming"}
      >
        <WorkIcon working={status === "streaming"} />
        <span data-label>{label}</span>
        <Icon name="chevronUp" size="xs" data-chevron />
      </Collapsible.Trigger>
      <Collapsible.Content className={collapsibleContentStyle}>
        <div
          data-work-details
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
