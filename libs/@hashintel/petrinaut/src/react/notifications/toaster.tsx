import { Portal } from "@ark-ui/react/portal";
import {
  Toast,
  Toaster as ArkToaster,
  createToaster,
} from "@ark-ui/react/toast";

import { css } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../state/portal-container-context";

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
  alignItems: "center",
  minHeight: "[26px]",
  width: "[max-content]",
  maxWidth: "[320px]",
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

const toastTitleStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[14px]",
});

export const NotificationsToaster = () => (
  <Portal container={usePortalContainerRef()}>
    <ArkToaster toaster={notificationsToaster}>
      {(toast) => (
        <Toast.Root className={toastRootStyle}>
          <Toast.Title className={toastTitleStyle}>{toast.title}</Toast.Title>
        </Toast.Root>
      )}
    </ArkToaster>
  </Portal>
);
