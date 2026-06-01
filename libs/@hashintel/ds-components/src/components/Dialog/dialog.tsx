import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";

import { cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../util/portal-container-context";
import { Button } from "../Button/button";
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
  titleActions,
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
      titleActions?: React.ReactNode;
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
    titleActions !== undefined;
  const hasHeader = header !== undefined || hasStructuredHeader;

  const hasStructuredFooter =
    footerActions !== undefined || footerSecondaryActions !== undefined;
  const hasFooter = footer !== undefined || hasStructuredFooter;

  const classes = styles({
    size,
    withPadding,
    headerless: !hasHeader,
    hasIcon: !!titleIconName,
  });

  const closeButton = !disableDefaultClose && (
    <Button
      variant="ghost"
      className={classes.closeButton}
      aria-label="Close dialog"
      onClick={() => {
        onClose?.();
      }}
      iconName="close"
      size="sm"
    />
  );

  const headerEl = hasStructuredHeader ? (
    <div className={classes.header}>
      <div className={classes.titleRow}>
        {titleIconName && (
          <Icon name={titleIconName} size="md" className={classes.titleIcon} />
        )}
        {title && (
          <ArkDialog.Title className={classes.title}>{title}</ArkDialog.Title>
        )}
        {titleActions ? (
          <div className={classes.headerRight}>
            <div className={classes.headerActions}>{titleActions}</div>
            {closeButton}
          </div>
        ) : (
          closeButton
        )}
      </div>
      {description && (
        <ArkDialog.Description className={classes.description}>
          {description}
        </ArkDialog.Description>
      )}
    </div>
  ) : (
    <div className={cx(classes.header, classes.hasCustomHeader)}>
      {header && <div>{header}</div>}
      {closeButton}
    </div>
  );

  const footerEl = hasFooter && (
    <div className={classes.footer}>
      {footer ?? (
        <>
          {footerSecondaryActions && (
            <div className={classes.footerSecondaryActions}>
              {footerSecondaryActions}
            </div>
          )}
          {footerActions && (
            <div className={classes.footerActions}>{footerActions}</div>
          )}
        </>
      )}
    </div>
  );

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
            {headerEl}
            <div className={classes.body}>{children}</div>
            {footerEl}

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
