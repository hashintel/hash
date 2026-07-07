import { LoadingSpinner } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

const center = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});
const loadingRow = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  color: "fg.subtle",
});
const loadingText = css({ textStyle: "sm", color: "fg.subtle" });
const errorText = css({ textStyle: "sm", color: "status.error.fg.body" });
const appSkeletonRoot = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minH: "0",
  h: "full",
  w: "full",
  bg: "bgSolid.min",
});
const appSkeletonTopBar = css({
  display: "flex",
  alignItems: "center",
  px: "6",
  py: "3",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
  flexShrink: 0,
});
const appSkeletonSitePicker = css({
  h: "10",
  w: "64",
  maxW: "[min(260px,45vw)]",
  rounded: "md",
  bg: "bg.subtle",
});
const appSkeletonContent = css({
  flex: "1",
  minH: "0",
  p: "6",
  display: "flex",
});
const appSkeletonContentBlock = css({
  flex: "1",
  minH: "[280px]",
  rounded: "lg",
  bg: "bg.subtle",
});

/** Centered, muted "loading…" message with a ds spinner. Size the area via `className` (e.g. `h-32`). */
export const LoadingState = ({
  message,
  className,
}: {
  message: string;
  className?: string;
}) => {
  return (
    <div className={cx(center, className)}>
      <div className={loadingRow}>
        <LoadingSpinner size="sm" />
        <p className={loadingText}>{message}</p>
      </div>
    </div>
  );
};

/** Supply-chain route loading skeleton matching the page chrome. */
export const SupplyChainAppSkeleton = ({
  className,
}: {
  className?: string;
}) => (
  <div
    aria-label="Loading"
    className={cx(appSkeletonRoot, className)}
    role="status"
  >
    <div className={appSkeletonTopBar}>
      <div className={appSkeletonSitePicker} />
    </div>
    <div className={appSkeletonContent}>
      <div className={appSkeletonContentBlock} />
    </div>
  </div>
);

/** Inline error message. Pad/position via `className` (e.g. `px-6 py-4`). */
export const ErrorState = ({
  message,
  className,
}: {
  message: string;
  className?: string;
}) => {
  return <p className={cx(errorText, className)}>{message}</p>;
};
