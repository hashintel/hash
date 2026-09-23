import { type RefObject, useRef, useState } from "react";

import { Button, Icon, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

/** Voice failures and recovery notices, disclosed on demand in the Voice dock. */
export const VoiceAlerts = ({
  alerts,
  onDismiss,
  docked,
  dockRef,
}: {
  alerts: readonly string[];
  onDismiss: () => void;
  docked: boolean;
  dockRef: RefObject<HTMLDivElement | null>;
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const countLabel = `${alerts.length} Voice ${alerts.length === 1 ? "issue" : "issues"}`;
  const latestAlert = alerts.at(-1) ?? "";
  const preview =
    latestAlert.length > 180
      ? `${latestAlert.slice(0, 180)}… Click for details.`
      : latestAlert;

  return (
    <>
      <Button
        ref={triggerRef}
        aria-label={`Show ${countLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        size="xs"
        variant="ghost"
        type="button"
        prefix={
          <Icon
            name="warning"
            size="sm"
            className={css({ color: "status.warning.fg.body" })}
          />
        }
        tooltip={preview}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {alerts.length > 1 ? alerts.length : null}
      </Button>
      {open && (
        <Popover
          triggerRef={docked ? dockRef : triggerRef}
          returnFocusRef={triggerRef}
          position={docked ? "top-start" : "bottom-end"}
          gapY={8}
          onClose={() => setOpen(false)}
        >
          <Popover.Container
            className={css({
              width: "[320px]",
              maxWidth: "[calc(100vw - 32px)]",
            })}
          >
            <Popover.Header title={countLabel} />
            <Popover.Body>
              <ul
                className={css({
                  margin: "0",
                  padding: "0",
                  listStyle: "none",
                  maxHeight: "[min(280px, 40vh)]",
                  overflowY: "auto",
                  overflowWrap: "anywhere",
                  whiteSpace: "pre-wrap",
                  fontSize: "sm",
                  display: "flex",
                  flexDirection: "column",
                  gap: "3",
                })}
              >
                {alerts.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </Popover.Body>
            <Popover.Footer>
              <Button
                size="xs"
                variant="ghost"
                iconName="copy"
                aria-label="Copy details"
                tooltip="Copy details"
                onClick={() =>
                  void navigator.clipboard.writeText(alerts.join("\n\n"))
                }
              />
              <Button size="xs" variant="ghost" onClick={onDismiss}>
                Dismiss Voice issues
              </Button>
            </Popover.Footer>
          </Popover.Container>
        </Popover>
      )}
    </>
  );
};
