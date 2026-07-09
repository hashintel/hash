import { css, cx } from "@hashintel/ds-helpers/css";

const base = css({
  textStyle: "sm",
  fontWeight: "medium",
  pb: "2",
  borderBottomWidth: "2px",
  borderBottomStyle: "solid",
  transition: "colors",
  cursor: "pointer",
});
const active = css({ borderColor: "fg.heading", color: "fg.heading" });
const inactive = css({
  borderColor: "[transparent]",
  color: "fg.subtle",
  _hover: { color: "fg.muted" },
});
const count = css({ ml: "1.5", textStyle: "xs", color: "fg.subtle" });

export const TabButton = ({
  active: isActive,
  onClick,
  label,
  count: countValue,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(base, isActive ? active : inactive)}
    >
      {label}
      <span className={count}>{countValue}</span>
    </button>
  );
};
