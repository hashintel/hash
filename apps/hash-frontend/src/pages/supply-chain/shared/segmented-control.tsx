import { css, cx } from "@hashintel/ds-helpers/css";

// DELIBERATELY local. The ds `SegmentedControl` renders a frosted-glass backdrop
// (`backdrop-filter: blur`, white/translucent fills, hardcoded rgba borders) and
// an oversized item box (`paddingX:5 paddingY:4`, `fontSize:sm`) that neither
// matches this app's flat neutral surfaces nor fits the `xs` toolbar density.
// We keep this control but drive every value from ds tokens/`textStyle` so it
// stays visually consistent.

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}

const group = css({
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "md",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "bg.surface",
  p: "0.5",
  gap: "0.5",
});

const button = css({
  px: "3",
  py: "1",
  textStyle: "xs",
  // Pin a tight leading: the `xs` textStyle's 1.6em line-height otherwise
  // inflates the control height well beyond its padding.
  lineHeight: "none",
  fontWeight: "medium",
  // Inner radius one step below the group's `md` so the active pill nests
  // cleanly inside the 0.5 padding; token-driven (no arbitrary px).
  borderRadius: "sm",
  transition: "colors",
  whiteSpace: "nowrap",
  cursor: "pointer",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "[transparent]",
});
const buttonActive = css({
  bg: "bgSolid.min",
  borderColor: "bd.subtle",
  color: "fg.heading",
  boxShadow: "sm",
});
const buttonInactive = css({
  color: "fg.subtle",
  _hover: { color: "fg.muted" },
});

export const SegmentedControl = <T extends string>({
  value,
  onChange,
  options,
  className,
}: SegmentedControlProps<T>) => {
  return (
    <div className={cx(group, className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cx(
            button,
            value === opt.value ? buttonActive : buttonInactive,
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};
