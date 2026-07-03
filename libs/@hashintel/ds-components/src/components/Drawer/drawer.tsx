import { Drawer as ArkDrawer } from "@ark-ui/react/drawer";
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
import { styles } from "./drawer.recipe";

import type { ExclusifyUnion, RequireAtLeastOne } from "type-fest";

export type DrawerSize = "sm" | "md" | "lg" | "xl";

export type DrawerShouldCloseOn =
  | "closeButtonAndOverlay"
  | "closeButton"
  | "none";

const DrawerContext = createContext<{
  classes: ReturnType<typeof styles>;
  onClose?: () => void;
  renderCloseButton: boolean;
  loading?: boolean;
} | null>(null);

const useDrawerContext = () => {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    throw new Error(
      "Drawer.Header, Drawer.Body and Drawer.Footer must be rendered inside <Drawer>",
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
  const { classes, onClose, renderCloseButton } = useDrawerContext();

  const hasStructuredHeader =
    title !== undefined ||
    description !== undefined ||
    iconName !== undefined ||
    actions !== undefined;

  const closeButton = renderCloseButton && (
    <Button
      variant="ghost"
      className={classes.closeButton}
      aria-label="Close drawer"
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
      <div className={classes.headerMain}>
        {iconName && (
          <Icon name={iconName} size="md" className={classes.titleIcon} />
        )}
        {/*
         * The actions/close float to the end within this text column so the
         * title and description wrap around them. On md and up the column is a
         * flex item (its own formatting context) sitting to the right of the
         * flexed icon; on sm it is a transparent block, so the icon float
         * from headerMain still reaches the text.
         */}
        <div className={classes.headerText}>
          {actions ? (
            <div className={classes.headerRight}>
              <div className={classes.headerActions}>{actions}</div>
              {closeButton}
            </div>
          ) : (
            closeButton
          )}
          {title && (
            <ArkDrawer.Title className={classes.title}>{title}</ArkDrawer.Title>
          )}
          {description && (
            <ArkDrawer.Description className={classes.description}>
              {description}
            </ArkDrawer.Description>
          )}
        </div>
      </div>
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
  const { classes } = useDrawerContext();

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
  const { classes, loading } = useDrawerContext();

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

const DrawerRoot = ({
  className,
  size = "md",
  variant = "partitionedFooter",
  children,
  shouldCloseOn = "closeButtonAndOverlay",
  loading,
  onClose,
  initialFocusRef,
  returnFocusRef,
  onKeyDown,
  ...ariaAttributes
}: {
  className?: string;
  size?: DrawerSize;
  onKeyDown?: React.KeyboardEventHandler<Element>;
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
  shouldCloseOn?: DrawerShouldCloseOn;
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
    <ArkDrawer.Root
      open
      // Slides in from the right; swiping the panel back towards that edge
      // dismisses it.
      swipeDirection="end"
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
          <ArkDrawer.Backdrop className={classes.backdrop} />
          <ArkDrawer.Positioner className={classes.positioner}>
            <ArkDrawer.Content
              {...ariaAttributes}
              className={cx(classes.content, className)}
              aria-busy={loading ?? undefined}
              onKeyDown={onKeyDown}
            >
              <DrawerContext.Provider value={ctx}>
                {
                  // if there's no header, we still display an empty one to display the close button + for layout
                  !hasHeader && <Header />
                }
                {children}
              </DrawerContext.Provider>
            </ArkDrawer.Content>
          </ArkDrawer.Positioner>
        </div>
      </Portal>
    </ArkDrawer.Root>
  );
};

export const Drawer = Object.assign(DrawerRoot, {
  Header,
  Body,
  Footer,
});
