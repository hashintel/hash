import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useRef,
} from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { Button } from "../components/Button/button";
import { Icon, type IconName } from "../components/Icon/icon";
import { LoadingSpinner } from "../components/Loading/loading-spinner";
import { overlayPartsStyles } from "./overlay-parts.recipe";
import { useAvoidScrollWidthChange } from "./use-avoid-scroll-width-change";

import type { ExclusifyUnion, RequireAtLeastOne } from "type-fest";

export type OverlayShouldCloseOn =
  | "closeButtonAndOverlay"
  | "closeButton"
  | "none";

/**
 * The Ark UI `Title` / `Description` primitives differ between Dialog and
 * Drawer (each wires up its own `aria-labelledby` / `aria-describedby`), so the
 * owning component injects them through context rather than the shared chrome
 * importing a specific namespace.
 */
type OverlayPrimitive = React.ElementType;

type OverlayContextValue = {
  classes: ReturnType<typeof overlayPartsStyles>;
  onClose?: () => void;
  renderCloseButton: boolean;
  loading?: boolean;
  Title: OverlayPrimitive;
  Description: OverlayPrimitive;
  /** Sets the close-button label and squares off the Drawer's right edge. */
  componentName: "Dialog" | "Drawer";
};

const OverlayContext = createContext<OverlayContextValue | null>(null);

const useOverlayContext = () => {
  const ctx = useContext(OverlayContext);
  if (!ctx) {
    throw new Error(
      "OverlayHeader, OverlayBody and OverlayFooter must be rendered inside a <Dialog> or <Drawer>",
    );
  }
  return ctx;
};

export type OverlayHeaderProps = ExclusifyUnion<
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

export const OverlayHeader = ({
  title,
  description,
  iconName,
  actions,
  children,
}: OverlayHeaderProps) => {
  const {
    classes,
    onClose,
    renderCloseButton,
    Title,
    Description,
    componentName,
  } = useOverlayContext();

  const hasStructuredHeader =
    title !== undefined ||
    description !== undefined ||
    iconName !== undefined ||
    actions !== undefined;

  const closeButton = renderCloseButton && (
    <Button
      variant="ghost"
      className={classes.closeButton}
      aria-label={`Close ${componentName.toLowerCase()}`}
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
         * flexed icon; below that it is a transparent block, so the icon float
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
          {title && <Title className={classes.title}>{title}</Title>}
          {description && (
            <Description className={classes.description}>
              {description}
            </Description>
          )}
        </div>
      </div>
    </div>
  );
};

export type OverlayFooterProps = ExclusifyUnion<
  | { children?: React.ReactNode }
  | RequireAtLeastOne<{
      actions?: React.ReactNode;
      secondaryActions?: React.ReactNode;
    }>
>;

export const OverlayFooter = ({
  children,
  actions,
  secondaryActions,
}: OverlayFooterProps) => {
  const { classes } = useOverlayContext();

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

export type OverlayBodyProps = {
  children: React.ReactNode;
  /**
   * Turn padding on/off. Used when the body content controls padding itself. defaults to true.
   * If set, you will need to apply useAvoidScrollWidthChange yourself if the content height/width can change.
   * */
  withPadding?: boolean;
};

export const OverlayBody = ({
  children,
  withPadding = true,
}: OverlayBodyProps) => {
  const { classes, loading } = useOverlayContext();

  const bodyRef = useRef<HTMLDivElement>(null);

  // Hold the body's content width steady as its vertical scrollbar appears and
  // disappears, so content doesn't shift sideways (a no-op with overlay
  // scrollbars). Skipped when the body forgoes its own padding, since it then
  // has no gutter to manage.
  useAvoidScrollWidthChange(bodyRef, withPadding);

  return (
    <div
      ref={bodyRef}
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

/**
 * Renders the shared chrome context inside a Dialog/Drawer `Content`. Detects
 * whether the caller supplied an `OverlayHeader` (to size the chrome and, if
 * absent, render an empty header carrying just the close button) and computes
 * the shared slot classes from the recipe.
 */
export const OverlaySections = ({
  size,
  variant,
  onClose,
  renderCloseButton,
  loading,
  Title,
  Description,
  componentName,
  children,
}: {
  size: "xs" | "sm" | "md" | "lg" | "xl" | "fullScreen";
  variant: "partitionedFooter" | "plain";
  onClose?: () => void;
  renderCloseButton: boolean;
  loading?: boolean;
  Title: OverlayPrimitive;
  Description: OverlayPrimitive;
  componentName: "Dialog" | "Drawer";
  children: React.ReactNode;
}) => {
  const headerChild = Children.toArray(children).find(
    (
      child,
    ): child is React.ReactElement<OverlayHeaderProps, typeof OverlayHeader> =>
      isValidElement(child) && child.type === OverlayHeader,
  );
  const hasHeader = !!headerChild;
  const titleIconName = headerChild?.props.iconName;

  const classes = useMemo(
    () =>
      overlayPartsStyles({
        size,
        variant,
        component: componentName === "Drawer" ? "drawer" : "dialog",
        hasIcon: !!titleIconName,
        headerless: !hasHeader,
      }),
    [size, variant, componentName, titleIconName, hasHeader],
  );

  const ctx = useMemo(
    () => ({
      classes,
      onClose,
      renderCloseButton,
      loading,
      Title,
      Description,
      componentName,
    }),
    [
      classes,
      onClose,
      renderCloseButton,
      loading,
      Title,
      Description,
      componentName,
    ],
  );

  return (
    <OverlayContext.Provider value={ctx}>
      {
        // if there's no header, we still display an empty one to display the close button + for layout
        !hasHeader && <OverlayHeader />
      }
      {children}
    </OverlayContext.Provider>
  );
};
