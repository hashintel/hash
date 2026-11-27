/** The clear buttons' X: stroked rather than an icon, so its weight follows Select's arrow. */
export const ClearGlyph = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 10 10"
    aria-hidden="true"
    className={className}
    fill="none"
    stroke="currentColor"
  >
    <path d="M0 0L10 10M10 0L0 10" vectorEffect="non-scaling-stroke" />
  </svg>
);
