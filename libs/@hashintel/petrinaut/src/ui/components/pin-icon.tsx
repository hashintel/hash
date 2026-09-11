/**
 * A thumbtack, for holding a floating surface open.
 *
 * Drawn here rather than taken from the icon set, which has no pin. Rounded
 * throughout and stroked thinly: it sits over a visualizer's own artwork, so
 * it has to read as a mark rather than compete as a picture.
 */
export const PinIcon = () => (
  <svg
    aria-hidden
    fill="none"
    height={13}
    viewBox="0 0 16 16"
    width={13}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Cap: a rounded bar across the head of the tack. */}
    <path
      d="M5.6 2.6H10.4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.3"
    />
    {/* Body: shoulders curving down to a rounded base. */}
    <path
      d="M6.6 2.6C6.6 5.2 6.1 7.4 5.4 8.7C5.2 9.1 5.4 9.5 5.9 9.5H10.1C10.6 9.5 10.8 9.1 10.6 8.7C9.9 7.4 9.4 5.2 9.4 2.6"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.3"
    />
    {/* Needle. */}
    <path
      d="M8 9.9V13.2"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.3"
    />
  </svg>
);
