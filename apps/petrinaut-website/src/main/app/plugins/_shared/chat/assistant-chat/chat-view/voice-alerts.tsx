import { type RefObject, useRef, useState } from "react";

import { Button, Icon, Popover } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const splitAlert = (message: string) => {
  const titleEnd = message.indexOf(". ");

  return titleEnd === -1
    ? { title: message, explanation: null }
    : {
        title: message.slice(0, titleEnd),
        explanation: message.slice(titleEnd + 2),
      };
};

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
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
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
                {alerts.map((message) => {
                  const { explanation, title } = splitAlert(message);

                  return (
                    <li
                      className={css({
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5",
                      })}
                      key={message}
                    >
                      <strong
                        className={css({
                          color: "neutral.s115",
                          fontWeight: "semibold",
                        })}
                      >
                        {title}
                      </strong>
                      {explanation && (
                        <span className={css({ color: "neutral.s90" })}>
                          {explanation}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Popover.Body>
            <Popover.Footer>
              <Button
                size="xs"
                variant="ghost"
                iconName={copyStatus === "copied" ? "check" : "copy"}
                aria-label={copyStatus === "copied" ? "Copied" : "Copy details"}
                onClick={() => {
                  setCopyStatus("idle");
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(alerts.join("\n\n"));
                      setCopyStatus("copied");
                    } catch {
                      setCopyStatus("failed");
                    }
                  })();
                }}
              >
                {copyStatus === "copied" ? "Copied" : "Copy details"}
              </Button>
              <Button size="xs" variant="ghost" onClick={onDismiss}>
                Dismiss
              </Button>
              <span
                aria-live="polite"
                className={css({ srOnly: true })}
                role="status"
              >
                {copyStatus === "copied"
                  ? "Voice issue details copied"
                  : copyStatus === "failed"
                    ? "Could not copy details"
                    : ""}
              </span>
            </Popover.Footer>
          </Popover.Container>
        </Popover>
      )}
    </>
  );
};
