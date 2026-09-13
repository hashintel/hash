/**
 * Native stand-ins for the ds controls a metric card's chart options are
 * built from, for tests under jsdom: the Ark popover positions itself
 * against a trigger jsdom cannot lay out, and the Ark select and segment
 * group float portalled lists it cannot measure. The popover renders its
 * panel in place, the select is a `<select>` and the segmented control a
 * row of `aria-pressed` buttons, so a test opens the menu and picks the way
 * a reader would, and the tooltip is its child alone. Spread them into a
 * `vi.mock("@hashintel/ds-components")` factory over the actual module.
 */
import type { ReactNode } from "react";

export const Tooltip = ({ children }: { children: ReactNode }) => (
  <>{children}</>
);

export const Popover = Object.assign(
  ({ children }: { children: ReactNode }) => <div>{children}</div>,
  {
    Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Body: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Header: ({ title }: { title?: ReactNode }) => <div>{title}</div>,
    Footer: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
  },
);

/** A required single select: `onChange` receives the picked value. */
export const Select = ({
  "aria-label": ariaLabel,
  items,
  onChange,
  value,
}: {
  "aria-label"?: string;
  items: readonly { value: string; text: string }[];
  onChange: (value: string) => void;
  value: string;
}) => (
  <select
    aria-label={ariaLabel}
    value={value}
    onChange={(event) => onChange(event.target.value)}
  >
    {items.map((item) => (
      <option key={item.value} value={item.value}>
        {item.text}
      </option>
    ))}
  </select>
);

export const SegmentedControl = ({
  "aria-label": ariaLabel,
  items,
  onChange,
  value,
}: {
  "aria-label"?: string;
  items: readonly { value: string; label?: ReactNode }[];
  onChange: (value: string) => void;
  value: string;
}) => (
  <div role="group" aria-label={ariaLabel}>
    {items.map((item) => (
      <button
        key={item.value}
        type="button"
        aria-pressed={item.value === value}
        onClick={() => onChange(item.value)}
      >
        {item.label}
      </button>
    ))}
  </div>
);
