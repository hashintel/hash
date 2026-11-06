export const markLight = ({ id }: { id: string }) => (
  <g fill="#e42313">
    <g clipPath={`url(#${id}-header_logo)`}>
      <path d="M18.185 0H0V3.63008H18.185V0Z" />
      <path d="M36.4044 7.26016H10.9247V10.8902H36.4044V7.26016Z" />
      <path d="M40.0345 14.5549H10.9247V18.185H40.0345V14.5549Z" />
      <path d="M36.4044 21.8151H10.9247V25.4451H36.4044V21.8151Z" />
      <path d="M29.1096 29.1097H10.9247V32.7398H29.1096V29.1097Z" />
    </g>
    <defs>
      <clipPath id={`${id}-header_logo`}>
        <rect width="40" height="32.7398" />
      </clipPath>
    </defs>
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g fill="#e42313">
    <g clipPath={`url(#${id}-header_logo)`}>
      <path d="M18.185 0H0V3.63008H18.185V0Z" />
      <path d="M36.4044 7.26016H10.9247V10.8902H36.4044V7.26016Z" />
      <path d="M40.0345 14.5549H10.9247V18.185H40.0345V14.5549Z" />
      <path d="M36.4044 21.8151H10.9247V25.4451H36.4044V21.8151Z" />
      <path d="M29.1096 29.1097H10.9247V32.7398H29.1096V29.1097Z" />
    </g>
    <defs>
      <clipPath id={`${id}-header_logo`}>
        <rect width="40" height="32.7398" />
      </clipPath>
    </defs>
  </g>
);
