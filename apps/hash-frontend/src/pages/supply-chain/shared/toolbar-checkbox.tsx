import { css } from "@hashintel/ds-helpers/css";

import type { ReactNode } from "react";

const label = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  textStyle: "xs",
  color: "fg.subtle",
  cursor: "pointer",
  whiteSpace: "nowrap",
});
const box = css({
  h: "3.5",
  w: "3.5",
  borderRadius: "sm",
  borderColor: "[rgba(0,0,0,0.15)]",
  cursor: "pointer",
});

/**
 * Compact native checkbox for the page-header toolbars. Native (not ds
 * `Checkbox`) on purpose: the ds control's 14px label / 20px gap is too heavy
 * for this xs-density row, and it exposes no size/className to slim it down.
 */
export const ToolbarCheckbox = ({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) => {
  return (
    <label className={label}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className={box}
      />

      {children}
    </label>
  );
};
