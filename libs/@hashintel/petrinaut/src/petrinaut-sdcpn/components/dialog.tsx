import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import { css } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export const Dialog = ({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = "sm",
}: DialogProps) => {
  const maxWidthValue = maxWidth === "sm" ? "600px" : "800px";

  return (
    <ArkDialog.Root open={open} onOpenChange={(details) => {
      if (!details.open) {
        onClose();
      }
    }}>
      <Portal>
        <ArkDialog.Backdrop
          className={css({
            position: "fixed",
            inset: "[0]",
            backgroundColor: "[rgba(0, 0, 0, 0.5)]",
            zIndex: "[1000]",
          })}
        />
        <ArkDialog.Positioner
          className={css({
            position: "fixed",
            inset: "[0]",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: "[1001]",
          })}
        >
          <ArkDialog.Content
            className={css({
              backgroundColor: "[white]",
              borderRadius: "radius.8",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
              maxWidth: `[${maxWidthValue}]`,
              width: "[90vw]",
              maxHeight: "[90vh]",
              display: "flex",
              flexDirection: "column",
            })}
          >
            {title && (
              <ArkDialog.Title
                className={css({
                  padding: "spacing.6",
                  paddingBottom: "spacing.4",
                  fontSize: "size.textlg",
                  fontWeight: "semibold",
                  color: "core.gray.90",
                })}
              >
                {title}
              </ArkDialog.Title>
            )}
            <ArkDialog.Description
              className={css({
                padding: "spacing.6",
                paddingTop: title ? "spacing.2" : "spacing.6",
                overflowY: "auto",
                flex: "1",
              })}
            >
              {children}
            </ArkDialog.Description>
            {footer && (
              <div
                className={css({
                  padding: "spacing.6",
                  paddingTop: "spacing.4",
                  borderTop: "1px solid",
                  borderTopColor: "core.gray.20",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "spacing.3",
                })}
              >
                {footer}
              </div>
            )}
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  );
};
