import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { Link } from "../../../../shared/ui/link";
import { LowSampleBadge } from "./shared/low-sample-badge";
import { ProductTags } from "./shared/product-tags";

import type { ReactNode } from "react";

const card = css({
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  bg: "bgSolid.min",
});
const cardHeader = css({
  px: "4",
  py: "2.5",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const cardTitle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
});
const cardBody = css({
  p: "3",
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});
const emptyText = css({
  textStyle: "xs",
  color: "fg.subtle",
  fontStyle: "italic",
});
const rowWrap = css({
  position: "relative",
  w: "full",
  borderRadius: "md",
  transition: "colors",
  _hover: { bg: "bg.subtle" },
});
const rowButton = css({
  w: "full",
  px: "2.5",
  py: "2",
  textAlign: "left",
  cursor: "pointer",
});
const rowLayout = css({ display: "flex", alignItems: "flex-start", gap: "3" });
// Reserve enough room on the right for the absolutely-positioned Brief button
// (icon + label + padding + the right:2.5 offset) so the value never underlaps it.
const rowLayoutBrief = css({ pr: "24" });
const rank = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.subtle",
  w: "4",
  fontVariantNumeric: "tabular-nums",
  pt: "0.5",
});
const labelWrap = css({ flex: "1", minW: "0" });
const labelText = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const subtitle = css({
  textStyle: "xs",
  color: "fg.subtle",
  fontVariantNumeric: "tabular-nums",
});
const valueSpan = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  textStyle: "sm",
  fontWeight: "semibold",
  fontVariantNumeric: "tabular-nums",
  flexShrink: 0,
  pt: "0.5",
});
const tagsRow = css({
  mt: "1.5",
  pl: "7",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "1",
});
const briefLink = css({
  position: "absolute",
  top: "2",
  right: "2.5",
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  borderRadius: "sm",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "bgSolid.min",
  px: "2.5",
  py: "1",
  textStyle: "xs",
  lineHeight: "none",
  fontWeight: "medium",
  color: "fg.muted",
  _hover: { borderColor: "bd.strong", color: "fg.heading" },
});

export const DashboardCard = ({
  title,
  controls,
  items,
  emptyMessage,
}: {
  title: string;
  controls?: ReactNode;
  items: Array<{
    key: string;
    label: string;
    products: Array<{ id: string; name: string }>;
    subtitle?: string;
    /** Optional native tooltip on the subtitle (e.g. batch-normalisation note). */ subtitleTooltip?: string;
    badges?: Array<{ label: string; title: string }>;
    value: string;
    valueIcon?: ReactNode;
    color: string;
    briefHref?: string;
    onClick: () => void;
  }>;
  emptyMessage: string;
}) => {
  return (
    <div className={card}>
      <div className={cardHeader}>
        <span className={cardTitle}>{title}</span>
        {controls}
      </div>
      <div className={cardBody}>
        {items.length === 0 && <p className={emptyText}>{emptyMessage}</p>}
        {items.map((item, index) => (
          <div key={item.key} className={rowWrap}>
            <button type="button" onClick={item.onClick} className={rowButton}>
              <div
                className={cx(
                  rowLayout,
                  item.briefHref ? rowLayoutBrief : undefined,
                )}
              >
                <span className={rank}>{index + 1}</span>
                <div className={labelWrap}>
                  <div className={labelText}>{item.label}</div>
                  {item.subtitle && (
                    <div
                      className={subtitle}
                      title={item.subtitleTooltip}
                      style={
                        item.subtitleTooltip ? { cursor: "help" } : undefined
                      }
                    >
                      {item.subtitle}
                    </div>
                  )}
                </div>
                <span className={valueSpan} style={{ color: item.color }}>
                  {item.valueIcon}
                  {item.value}
                </span>
              </div>
              <div className={tagsRow}>
                <ProductTags products={item.products} />
                {item.badges?.map((badge) => (
                  <LowSampleBadge
                    key={`${item.key}-${badge.label}`}
                    label={badge.label}
                    title={badge.title}
                  />
                ))}
              </div>
            </button>
            {item.briefHref && (
              <Link
                href={item.briefHref}
                onClick={(event) => event.stopPropagation()}
                className={briefLink}
              >
                <Icon name="fileLines" size="xs" />
                Brief
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
