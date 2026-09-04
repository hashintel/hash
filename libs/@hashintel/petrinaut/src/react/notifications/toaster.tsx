import { Portal } from "@ark-ui/react/portal";
import {
  Toast,
  Toaster as ArkToaster,
  createToaster,
} from "@ark-ui/react/toast";

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
  alignItems: "flex-start",
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

export const NotificationsToaster = () => (
  <Portal container={usePortalContainerRef()}>
    <ArkToaster toaster={notificationsToaster}>
      {(toast) => {
        const detail =
          typeof toast.description === "string" ? toast.description : undefined;

        return (
          <Toast.Root className={toastRootStyle}>
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
            <div className={toastActionsStyle}>
              {detail && (
                <Button
                  aria-label="Copy details"
                  className={toastActionStyle}
                  iconName="copy"
                  onClick={() => {
                    void navigator.clipboard.writeText(detail);
                  }}
                  size="xs"
                  tooltip="Copy details"
                  variant="ghost"
                />
              )}
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
          </Toast.Root>
        );
      }}
    </ArkToaster>
  </Portal>
);
