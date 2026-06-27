import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { Link } from "../../../shared/ui/link";
import {
  briefLinkStyle,
  neutralActionButtonStyle,
} from "./action-button-styles";
import { StatusIcon } from "./status-dialog";

import type { MouseEventHandler, ReactNode } from "react";

// ── Square "?" docs button (identical in the main header + slide-over) ──────
const docsButton = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  h: "7",
  w: "7",
  borderRadius: "md",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "bgSolid.min",
  color: "fg.subtle",
  cursor: "pointer",
  transition: "colors",
  _hover: { color: "fg.heading", bg: "bg.subtle" },
});
const docsButtonActive = css({ color: "fg.heading", bg: "bg.subtle" });

export const DocsIconButton = ({
  onClick,
  label = "Open documentation",
  active = false,
  className,
}: {
  onClick: () => void;
  label?: string;
  active?: boolean;
  className?: string;
}) => {
  return (
    <button
      type="button"
      className={cx(docsButton, active && docsButtonActive, className)}
      aria-label={label}
      onClick={onClick}
    >
      ?
    </button>
  );
};

// ── Shared Brief / Status / Data pill buttons ───────────────────────────────
// One source of truth for the action buttons that appear in the opportunities
// table, the dwell/planning tables, and the slide-over header.

/** Blue "Brief" link that opens the opportunity brief in a new tab. */
export const BriefLink = ({
  href,
  onClick,
  className,
}: {
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}) => {
  return (
    <Link
      href={href}
      className={cx(briefLinkStyle, className)}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
    >
      <Icon name="fileLines" size="xs" />
      Brief
    </Link>
  );
};

/** White pill button used for the Status / Data actions. */
export const NeutralActionButton = ({
  onClick,
  icon,
  children,
  className,
}: {
  onClick: MouseEventHandler<HTMLButtonElement>;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) => {
  return (
    <button
      type="button"
      className={cx(neutralActionButtonStyle, className)}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
};

/** Convenience: the standard white "Status" button. */
export const StatusActionButton = ({
  onClick,
  className,
}: {
  onClick: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}) => {
  return (
    <NeutralActionButton
      onClick={onClick}
      icon={<StatusIcon />}
      className={className}
    >
      Status
    </NeutralActionButton>
  );
};
