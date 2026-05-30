import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";

import { cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../util/portal-container-context";
import { Icon, type IconName } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { styles } from "./dialog.recipe";

import type { ExclusifyUnion } from "type-fest";

export type DialogSize = "xs" | "sm" | "md" | "lg" | "xl" | "fullScreen";

export const Dialog = ({
  className,
  size = "md",
  children,
  disableDefaultClose,
  loading,
  onClose,
  withPadding = true,
  allowBodyScroll,
  initialFocusRef,
  returnFocusRef,
  header,
  title,
  description,
  titleIconName,
  actions,
  footer,
  footerActions,
  footerSecondaryActions,
  ...ariaAttributes
}: {
  className?: string;
  size?: DialogSize;
  children: React.ReactNode;
  disableDefaultClose?: boolean;
  loading?: boolean;
  onClose?: () => void;
  /** Turn padding on/off. Used when the dialog content controls padding itself. defaults to true */
  withPadding?: boolean;
  /** Allow the root document/html container to scroll while the dialog is open */
  allowBodyScroll?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  returnFocusRef?: React.RefObject<HTMLElement>;
} & ExclusifyUnion<
  | {
      title?: React.ReactNode;
      description?: React.ReactNode;
      titleIconName?: IconName;
      actions?: React.ReactNode;
    }
  | {
      header?: React.ReactNode;
    }
> &
  ExclusifyUnion<
    | { footer?: React.ReactNode }
    | {
        footerActions?: React.ReactNode;
        footerSecondaryActions?: React.ReactNode;
      }
  > &
  React.AriaAttributes) => {
  const portalContainerRef = usePortalContainerRef();

  const hasStructuredHeader =
    title !== undefined ||
    description !== undefined ||
    titleIconName !== undefined ||
    actions !== undefined;
  const hasHeader = header !== undefined || hasStructuredHeader;

  const hasStructuredFooter =
    footerActions !== undefined || footerSecondaryActions !== undefined;
  const hasFooter = footer !== undefined || hasStructuredFooter;

  const classes = styles({
    size,
    withPadding,
    headerless: !hasHeader,
    footerless: !hasFooter,
  });

  return (
    <ArkDialog.Root
      defaultOpen
      modal={!allowBodyScroll}
      preventScroll={!allowBodyScroll}
      onOpenChange={(event) => {
        if (!event.open) {
          onClose?.();
        }
      }}
      initialFocusEl={
        initialFocusRef ? () => initialFocusRef.current : undefined
      }
      finalFocusEl={returnFocusRef ? () => returnFocusRef.current : undefined}
    >
      <Portal container={portalContainerRef}>
        <ArkDialog.Backdrop className={classes.backdrop} />
        <ArkDialog.Positioner className={classes.positioner}>
          <ArkDialog.Content
            {...ariaAttributes}
            className={cx(classes.content, className)}
            aria-busy={loading ?? undefined}
          >
            {hasHeader ? (
              <div className={classes.header}>
                {header ?? (
                  <>
                    <div className={classes.titleRow}>
                      {titleIconName ? (
                        <Icon
                          name={titleIconName}
                          size="md"
                          className={classes.titleIcon}
                        />
                      ) : null}
                      <div>
                        {title !== undefined ? (
                          <ArkDialog.Title className={classes.title}>
                            {title}
                          </ArkDialog.Title>
                        ) : null}
                        {description !== undefined ? (
                          <ArkDialog.Description
                            className={classes.description}
                          >
                            {description}
                          </ArkDialog.Description>
                        ) : null}
                      </div>
                    </div>
                    {actions ? (
                      <div className={classes.headerActions}>{actions}</div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            <div className={classes.body}>{children}</div>

            {hasFooter ? (
              <div className={classes.footer}>
                {footer ?? (
                  <>
                    <div className={classes.footerSecondaryActions}>
                      {footerSecondaryActions}
                    </div>
                    <div className={classes.footerActions}>{footerActions}</div>
                  </>
                )}
              </div>
            ) : null}

            {disableDefaultClose ? null : (
              <ArkDialog.CloseTrigger
                className={classes.closeButton}
                aria-label="Close dialog"
              >
                <Icon name="close" size="sm" />
              </ArkDialog.CloseTrigger>
            )}

            {loading ? (
              <div className={classes.loadingOverlay} aria-live="polite">
                <LoadingSpinner size="md" />
              </div>
            ) : null}
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  );
};
