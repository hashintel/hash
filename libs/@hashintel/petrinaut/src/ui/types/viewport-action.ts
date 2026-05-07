export type ViewportAction = {
  /** Unique key for React rendering. */
  key: string;
  /** Icon element to render inside the button. */
  icon: React.ReactNode;
  /** Accessible label for the button. */
  label: string;
  /** Tooltip text shown on hover. */
  tooltip: string;
  /** Click handler. */
  onClick?: () => void;
  /** Inline styles applied to the button element. */
  style?: React.CSSProperties;
  /** CSS class name applied to the button element. */
  className?: string;
  /** Ref callback to access the underlying button DOM element. */
  ref?: React.Ref<HTMLButtonElement>;
};
