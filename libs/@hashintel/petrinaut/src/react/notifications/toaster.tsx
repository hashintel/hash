import { Portal } from "@ark-ui/react/portal";
import {
  Toast,
  Toaster as ArkToaster,
  createToaster,
} from "@ark-ui/react/toast";
import { useEffect, useState } from "react";

import { Button, usePortalContainerRef } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

export const notificationsToaster = createToaster({
  gap: 8,
  offsets: "16px",
  placement: "bottom-end",
  removeDelay: 200,
});

const toastRootStyle = css({
  translate: "[var(--x, 0) var(--y, 0)]",
  scale: "[var(--scale, 1)]",
  zIndex: "[var(--z-index, 2147483647)]",
  opacity: "[var(--opacity, 1)]",
  willChange: "[translate, opacity, scale]",
  transition: "[translate 300ms, scale 300ms, opacity 300ms, box-shadow 300ms]",
  transitionTimingFunction: "[cubic-bezier(0.21, 1.02, 0.73, 1)]",
  display: "flex",
  // A message on its own sits centred against its close button. One that
  // carries detail grows into a column, so its title lines up with the top
  // of the buttons beside it.
  alignItems: "center",
  "&[data-detail]": {
    alignItems: "flex-start",
  },
  gap: "2",
  minHeight: "[26px]",
  width: "[max-content]",
  maxWidth: "[min(480px, calc(100vw - 32px))]",
  borderRadius: "lg",
  boxShadow: "[0 8px 24px rgba(0, 0, 0, 0.24)]",
  paddingX: "4",
  paddingY: "3",
  userSelect: "none",
  backgroundColor: "neutral.s120",
  color: "neutral.s00",
  '&[data-state="closed"]': {
    transition: "[translate 300ms, scale 300ms, opacity 300ms]",
    transitionTimingFunction: "[cubic-bezier(0.06, 0.71, 0.55, 1)]",
  },
  '&[data-type="error"]': {
    backgroundColor: "red.s100",
  },
});

const toastContentStyle = css({
  display: "flex",
  flex: "[1]",
  minWidth: "[0]",
  flexDirection: "column",
  gap: "1",
});

const toastTitleStyle = css({
  overflow: "hidden",
  overflowWrap: "anywhere",
  lineClamp: "4",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[14px]",
});

const toastDescriptionStyle = css({
  maxHeight: "[240px]",
  overflow: "auto",
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
  fontSize: "xs",
  lineHeight: "[18px]",
  userSelect: "text",
});

const toastActionsStyle = css({
  display: "flex",
  flexShrink: "[0]",
  gap: "1",
});

const toastActionStyle = css({
  color: "neutral.s00",
  _hover: {
    color: "neutral.s00",
  },
});

const COPY_FEEDBACK_DURATION_MS = 2000;

const copyTextWithDocument = (text: string) => {
  if (typeof document.execCommand !== "function") {
    return false;
  }

  const textArea = document.createElement("textarea");
  textArea.dataset.clipboardFallback = "";
  textArea.value = text;
  textArea.readOnly = true;
  textArea.tabIndex = -1;
  textArea.setAttribute("aria-hidden", "true");
  textArea.style.position = "fixed";
  textArea.style.inset = "0 auto auto -9999px";
  textArea.style.opacity = "0";

  document.body.append(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, text.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
};

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyTextWithDocument(text);
  }
};

const CopyDetailsButton = ({ detail }: { detail: string }) => {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") {
      return;
    }

    const timeoutId = setTimeout(
      () => setStatus("idle"),
      COPY_FEEDBACK_DURATION_MS,
    );
    return () => clearTimeout(timeoutId);
  }, [status]);

  const label =
    status === "copied"
      ? "Copied"
      : status === "failed"
        ? "Copy failed"
        : "Copy details";
  const iconName =
    status === "copied" ? "check" : status === "failed" ? "warning" : "copy";

  return (
    <Button
      aria-label={label}
      className={toastActionStyle}
      iconName={iconName}
      onClick={() => {
        void copyText(detail).then((copied) => {
          setStatus(copied ? "copied" : "failed");
        });
      }}
      size="xs"
      tooltip={label}
      variant="ghost"
    />
  );
};

export const NotificationsToaster = () => (
  <Portal container={usePortalContainerRef()}>
    <ArkToaster toaster={notificationsToaster}>
      {(toast) => {
        const detail =
          typeof toast.description === "string" ? toast.description : undefined;

        // An error notification stays until it is dismissed, and one with
        // detail is there to be read, so both offer a way out. A plain
        // message clears itself and stays a single compact line.
        const dismissible = detail !== undefined || toast.type === "error";

        return (
          <Toast.Root
            className={toastRootStyle}
            data-detail={detail === undefined ? undefined : ""}
          >
            <div className={toastContentStyle}>
              <Toast.Title className={toastTitleStyle}>
                {toast.title}
              </Toast.Title>
              {detail && (
                <Toast.Description className={toastDescriptionStyle}>
                  {detail}
                </Toast.Description>
              )}
            </div>
            {dismissible && (
              <div className={toastActionsStyle}>
                {detail && <CopyDetailsButton detail={detail} />}
                <Toast.CloseTrigger asChild>
                  <Button
                    aria-label="Close notification"
                    className={toastActionStyle}
                    iconName="close"
                    size="xs"
                    tooltip="Close notification"
                    variant="ghost"
                  />
                </Toast.CloseTrigger>
              </div>
            )}
          </Toast.Root>
        );
      }}
    </ArkToaster>
  </Portal>
);
