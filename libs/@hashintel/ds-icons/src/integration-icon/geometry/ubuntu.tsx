export const markLight = ({ id }: { id: string }) => (
  <g fill="#E95420">
    <circle cx="50" cy="50" r="45" fill="#f47421" />
    <circle
      cx="50"
      cy="50"
      r="21.8"
      fill="none"
      stroke="#fff"
      strokeWidth="8.6"
    />
    <g id={`${id}-a`}>
      <circle cx="19.4" cy="50" r="8.4" fill="#f47421" />
      <path stroke="#f47421" strokeWidth="3.2" d="M67 50h10" />
      <circle cx="19.4" cy="50" r="6" fill="#fff" />
    </g>
    <use xlinkHref={`#${id}-a`} transform="rotate(120 50 50)" />
    <use xlinkHref={`#${id}-a`} transform="rotate(240 50 50)" />
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g fill="#E95420">
    <circle cx="50" cy="50" r="45" fill="#f47421" />
    <circle
      cx="50"
      cy="50"
      r="21.8"
      fill="none"
      stroke="#fff"
      strokeWidth="8.6"
    />
    <g id={`${id}-a`}>
      <circle cx="19.4" cy="50" r="8.4" fill="#f47421" />
      <path stroke="#f47421" strokeWidth="3.2" d="M67 50h10" />
      <circle cx="19.4" cy="50" r="6" fill="#fff" />
    </g>
    <use xlinkHref={`#${id}-a`} transform="rotate(120 50 50)" />
    <use xlinkHref={`#${id}-a`} transform="rotate(240 50 50)" />
  </g>
);
