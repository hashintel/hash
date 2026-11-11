/**
 * figma-ds InlineBanner (`777:38874`): a message inside the page. 12 px radius, 12 px padding, a 16 px icon, a
 * semibold title over a regular description, then the action and an optional ×. Each status tints the fill, the
 * border and the words with its own hue's lightest DS steps.
 */
import { Button, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

type Status = "neutral" | "info" | "warning" | "error" | "success";

const bannerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  padding: "3",
  borderRadius: "xl",
  borderWidth: "thin",
  borderStyle: "solid",
  textStyle: "sm",
});

const statusStyles: Record<Status, string> = {
  neutral: css({
    backgroundColor: "neutral.bg.subtle.hover",
    borderColor: "neutral.bd.subtle",
    color: "neutral.fg.heading",
  }),
  info: css({
    backgroundColor: "blue.bgSolid.min",
    borderColor: "blue.bd.subtle",
    color: "blue.fg.body",
  }),
  warning: css({
    backgroundColor: "orange.bgSolid.min",
    borderColor: "orange.bd.subtle",
    color: "orange.fg.body",
  }),
  error: css({
    backgroundColor: "red.bgSolid.min",
    borderColor: "red.bd.subtle",
    color: "red.fg.body",
  }),
  success: css({
    backgroundColor: "green.bgSolid.min",
    borderColor: "green.bd.subtle",
    color: "green.fg.body",
  }),
};

const contentStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "1.5",
  flex: "1",
  minWidth: "[0]",
});

const iconStyle = css({ display: "flex", paddingTop: "[1px]", flexShrink: 0 });

const messageStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  flex: "1",
  minWidth: "[0]",
  paddingRight: "1",
});

const titleStyle = css({ fontWeight: "semibold", lineHeight: "[1.25]" });

const descriptionStyle = css({ lineHeight: "[1.5]" });

const actionsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "0.5",
  flexShrink: 0,
});

export const InlineBanner = ({
  status = "neutral",
  title,
  description,
  icon = true,
  action,
  onDismiss,
  className,
  ...rest
}: {
  status?: Status;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: boolean;
  /** The banner's one button, e.g. a DS Button size sm, variant subtle. */
  action?: React.ReactNode;
  /** Shows the × when set. */
  onDismiss?: () => void;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "title">) => (
  <div className={cx(bannerStyle, statusStyles[status], className)} {...rest}>
    <div className={contentStyle}>
      {icon ? (
        <span className={iconStyle}>
          <Icon name="info" size="sm" />
        </span>
      ) : null}
      <div className={messageStyle}>
        <span className={titleStyle}>{title}</span>
        {description ? (
          <span className={descriptionStyle}>{description}</span>
        ) : null}
      </div>
    </div>
    {action || onDismiss ? (
      <div className={actionsStyle}>
        {action}
        {onDismiss ? (
          <Button
            size="sm"
            variant="ghost"
            tone="neutral"
            iconName="close"
            aria-label="Dismiss"
            onClick={onDismiss}
          />
        ) : null}
      </div>
    ) : null}
  </div>
);
