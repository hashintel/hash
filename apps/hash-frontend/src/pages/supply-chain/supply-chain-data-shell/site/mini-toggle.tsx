import { css, cx } from "@hashintel/ds-helpers/css";

const container = css({
  display: "inline-flex",
  borderRadius: "md",
  bg: "bg.subtle",
  p: "0.5",
});
const btnBase = css({
  px: "2",
  py: "0.5",
  borderRadius: "sm",
  textStyle: "xs",
  fontWeight: "medium",
  transition: "colors",
  cursor: "pointer",
});
const btnSelected = css({
  bg: "bgSolid.min",
  color: "fg.heading",
  boxShadow: "sm",
});
const btnUnselected = css({
  color: "fg.subtle",
  _hover: { color: "fg.heading" },
});

export const MiniToggle = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) => {
  return (
    <div className={container}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            btnBase,
            value === option.value ? btnSelected : btnUnselected,
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
