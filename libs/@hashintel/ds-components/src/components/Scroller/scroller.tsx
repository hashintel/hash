/* Add a visual cue when content is scrollable. */
export const Scroller = ({
  className,
  children,
  vertical,
  horizontal,
  stableScrollGutter,
  onScrolledToBottom,
}: {
  className?: string;
  children: React.ReactNode;
  /* Allow scrolling content vertically */
  vertical?: boolean;
  /* Allow scrolling content horizontally */
  horizontal?: boolean;
  /* Prevent jank if content transitions between scrollable and non-scrollable content */
  stableScrollGutter?: boolean;
  onScrolledToBottom?: () => void;
}) => {
  return <div className={className}>{children}</div>;
};
