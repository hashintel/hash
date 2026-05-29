"use client";

import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";

import { cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../util/portal-container-context";
import { Icon, type IconName } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { styles } from "./dialog.recipe";

import type { RequireOneOrNone } from "type-fest";

export type DialogSize = "xs" | "sm" | "md" | "lg" | "xl" | "fullScreen";

type SharedDialogProps = {
  className?: string;
  size?: DialogSize;
  children: React.ReactNode;
  disableDefaultClose?: boolean;
  loading?: boolean;
  onClose?: () => void;
  /** Turn padding on/off. Used when the dialog content controls padding itself. defaults to true */
  withPadding?: boolean;
  allowBodyScroll?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  returnFocusRef?: React.RefObject<HTMLElement>;
};

type StructuredHeader = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  titleIconName?: IconName;
  actions?: React.ReactNode;
};

type CustomHeader = {
  header?: React.ReactNode;
};

type FooterChoice = RequireOneOrNone<
  | { footer?: React.ReactNode }
  | {
      footerActions?: React.ReactNode;
      footerSecondaryActions?: React.ReactNode;
    }
>;

export type DialogProps = SharedDialogProps &
  (StructuredHeader | CustomHeader) &
  FooterChoice &
  React.AriaAttributes;

const ariaAttributeKeys = new Set([
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-modal",
]);

export const Dialog = (props: DialogProps) => {
  const {
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
  } = props;

  const portalContainerRef = usePortalContainerRef();

  const header = "header" in props ? props.header : undefined;
  const title = "title" in props ? props.title : undefined;
  const description = "description" in props ? props.description : undefined;
  const titleIconName =
    "titleIconName" in props ? props.titleIconName : undefined;
  const actions = "actions" in props ? props.actions : undefined;

  const footer = "footer" in props ? props.footer : undefined;
  const footerActions =
    "footerActions" in props ? props.footerActions : undefined;
  const footerSecondaryActions =
    "footerSecondaryActions" in props
      ? props.footerSecondaryActions
      : undefined;

  const hasStructuredHeader =
    title !== undefined ||
    description !== undefined ||
    titleIconName !== undefined ||
    actions !== undefined;
  const hasHeader = header !== undefined || hasStructuredHeader;

  const hasStructuredFooter =
    footerActions !== undefined || footerSecondaryActions !== undefined;
  const hasFooter = footer !== undefined || hasStructuredFooter;

  const ariaProps: React.AriaAttributes = {};
  const propsRecord = props as unknown as Record<string, unknown>;
  for (const key of Object.keys(propsRecord)) {
    if (ariaAttributeKeys.has(key)) {
      (ariaProps as Record<string, unknown>)[key] = propsRecord[key];
    }
  }

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
            {...ariaProps}
            className={cx(classes.content, className)}
            aria-busy={loading || undefined}
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
