import { Dialog as ArkDialog } from "@ark-ui/react/dialog";
import { Portal } from "@ark-ui/react/portal";
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useMemo,
} from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { usePortalContainerRef } from "../../util/portal-container-context";
import { Button } from "../Button/button";
import { Icon, type IconName } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { styles } from "./dialog.recipe";

import type { ExclusifyUnion, RequireAtLeastOne } from "type-fest";

export type DialogSize = "xs" | "sm" | "md" | "lg" | "xl" | "fullScreen";

export type DialogShouldCloseOn =
  | "closeButtonAndOverlay"
  | "closeButton"
  | "none";

const DialogContext = createContext<{
  classes: ReturnType<typeof styles>;
  onClose?: () => void;
  renderCloseButton: boolean;
  loading?: boolean;
} | null>(null);

const useDialogContext = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error(
      "Dialog.Header, Dialog.Body and Dialog.Footer must be rendered inside <Dialog>",
    );
  }
  return ctx;
};

type HeaderProps = ExclusifyUnion<
  | {
      title?: React.ReactNode;
      description?: React.ReactNode;
      iconName?: IconName;
      actions?: React.ReactNode;
    }
  | {
      children?: React.ReactNode;
    }
>;
const Header = ({
  title,
  description,
  iconName,
  actions,
  children,
}: HeaderProps) => {
  const { classes, onClose, renderCloseButton } = useDialogContext();

  const hasStructuredHeader =
    title !== undefined ||
    description !== undefined ||
    iconName !== undefined ||
    actions !== undefined;

  const closeButton = renderCloseButton && (
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

  if (!hasStructuredHeader) {
    return (
      <div className={cx(classes.header, classes.hasCustomHeader)}>
        {children && <div>{children}</div>}
        {closeButton}
      </div>
    );
  }

  return (
    <div className={classes.header}>
      <div>
        {iconName && (
          <Icon name={iconName} size="md" className={classes.titleIcon} />
        )}
        {actions ? (
          <div className={classes.headerRight}>
            <div className={classes.headerActions}>{actions}</div>
            {closeButton}
          </div>
        ) : (
          closeButton
        )}
        {title && (
          <ArkDialog.Title className={classes.title}>{title}</ArkDialog.Title>
        )}
      </div>
      {description && (
        <ArkDialog.Description className={classes.description}>
          {description}
        </ArkDialog.Description>
      )}
    </div>
  );
};

type FooterProps = ExclusifyUnion<
  | { children?: React.ReactNode }
  | RequireAtLeastOne<{
      actions?: React.ReactNode;
      secondaryActions?: React.ReactNode;
    }>
>;
const Footer = ({ children, actions, secondaryActions }: FooterProps) => {
  const { classes } = useDialogContext();

  return (
    <div className={classes.footer}>
      {children ?? (
        <>
          {secondaryActions && (
            <div className={classes.footerSecondaryActions}>
              {secondaryActions}
            </div>
          )}
          {actions && <div className={classes.footerActions}>{actions}</div>}
        </>
      )}
    </div>
  );
};

type BodyProps = {
  children: React.ReactNode;
  /** Turn padding on/off. Used when the body content controls padding itself. defaults to true */
  withPadding?: boolean;
};
const Body = ({ children, withPadding = true }: BodyProps) => {
  const { classes, loading } = useDialogContext();

  return (
    <div
      className={cx(
        classes.body,
        !withPadding && css({ padding: "[0 !important]" }),
      )}
    >
      {children}
      {loading ? (
        <div className={classes.loadingOverlay} aria-live="polite">
          <LoadingSpinner size="lg" className={classes.loadingSpinner} />
        </div>
      ) : null}
    </div>
  );
};

const DialogRoot = ({
  className,
  size = "md",
  variant = "partitionedFooter",
  children,
  shouldCloseOn = "closeButtonAndOverlay",
  loading,
  onClose,
  initialFocusRef,
  returnFocusRef,
  ...ariaAttributes
}: {
  className?: string;
  size?: DialogSize;
  variant?: "partitionedFooter" | "plain";
  children:
    | readonly [
        React.ReactElement<HeaderProps, typeof Header>,
        React.ReactElement<BodyProps, typeof Body>,
        React.ReactElement<FooterProps, typeof Footer>?,
      ]
    | readonly [
        React.ReactElement<BodyProps, typeof Body>,
        React.ReactElement<FooterProps, typeof Footer>?,
      ]
    | React.ReactElement<BodyProps, typeof Body>;
  shouldCloseOn?: DialogShouldCloseOn;
  loading?: boolean;
  onClose?: () => void;
  initialFocusRef?: React.RefObject<HTMLElement>;
  returnFocusRef?: React.RefObject<HTMLElement>;
} & React.AriaAttributes) => {
  const portalContainerRef = usePortalContainerRef();

  const headerChild = Children.toArray(children).find(
    (child): child is React.ReactElement<HeaderProps, typeof Header> =>
      isValidElement(child) && child.type === Header,
  );
  const hasHeader = !!headerChild;
  const titleIconName = headerChild?.props.iconName;

  const classes = useMemo(
    () =>
      styles({
        size,
        headerless: !hasHeader,
        hasIcon: !!titleIconName,
        variant,
      }),
    [size, hasHeader, titleIconName, variant],
  );

  const renderCloseButton = shouldCloseOn !== "none";
  const closeOnEscape = shouldCloseOn !== "none";
  const closeOnInteractOutside = shouldCloseOn === "closeButtonAndOverlay";

  const ctx = useMemo(
    () => ({ classes, onClose, renderCloseButton, loading }),
    [classes, onClose, renderCloseButton, loading],
  );

  return (
    <ArkDialog.Root
      open
      closeOnEscape={closeOnEscape}
      closeOnInteractOutside={closeOnInteractOutside}
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
        <div className={classes.stackRoot}>
          <ArkDialog.Backdrop className={classes.backdrop} />
          <ArkDialog.Positioner className={classes.positioner}>
            <ArkDialog.Content
              {...ariaAttributes}
              className={cx(classes.content, className)}
              aria-busy={loading ?? undefined}
            >
              <DialogContext.Provider value={ctx}>
                {
                  // if there's no header, we still display an empty one to display the close button + for layout
                  !hasHeader && <Header />
                }
                {children}
              </DialogContext.Provider>
            </ArkDialog.Content>
          </ArkDialog.Positioner>
        </div>
      </Portal>
    </ArkDialog.Root>
  );
};

export const Dialog = Object.assign(DialogRoot, {
  Header,
  Body,
  Footer,
});
