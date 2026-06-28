import { css, cx } from "@hashintel/ds-helpers/css";

import { CATEGORIES } from "../../shared/categories";

const wrap = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "1.5",
});
const group = css({ display: "inline-flex", alignItems: "center", gap: "0.5" });
const catButtonBase = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  px: "2",
  py: "1",
  borderRadius: "sm",
  textStyle: "xs",
  lineHeight: "none",
  fontWeight: "medium",
  transition: "colors",
  cursor: "pointer",
});
const catButtonOn = css({ color: "fg.heading" });
const catButtonOff = css({ color: "fg.subtle", _hover: { color: "fg.muted" } });
const dot = css({
  display: "inline-block",
  w: "1.5",
  h: "1.5",
  borderRadius: "full",
});

export const CategoryFilter = ({
  selected,
  onChange,
  hiddenKeys = new Set(),
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  hiddenKeys?: Set<string>;
}) => {
  const visibleCategories = CATEGORIES.filter(
    (cat) => !hiddenKeys.has(cat.key),
  );
  const visibleKeys = visibleCategories.map((cat) => cat.key);
  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) {
      const selectedVisibleCount = visibleKeys.filter((visibleKey) =>
        next.has(visibleKey),
      ).length;
      if (selectedVisibleCount === 1) {
        onChange(new Set(visibleKeys));
        return;
      }
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  };

  return (
    <div className={wrap}>
      <div className={group}>
        {visibleCategories.map((cat) => {
          const isOn = selected.has(cat.key);
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => toggle(cat.key)}
              title={
                isOn && selected.size === 1
                  ? "Click to reset to All"
                  : isOn
                    ? `Hide ${cat.label}`
                    : `Show ${cat.label}`
              }
              className={cx(catButtonBase, isOn ? catButtonOn : catButtonOff)}
            >
              <span
                className={dot}
                style={{ backgroundColor: isOn ? cat.color : "#c0c0c0" }}
              />
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
