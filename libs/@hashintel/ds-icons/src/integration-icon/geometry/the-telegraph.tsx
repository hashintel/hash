export const markLight = ({ id: _id }: { id: string }) => (
  <g fill="#111111">
    <path d="M0 0v24h24V0H0zm6 6h12v3h-4.5v9h-3V9H6V6Z" />
  </g>
);
export const markDark = ({ id: _id }: { id: string }) => (
  <g fill="#F5F7FA">
    <path d="M0 0v24h24V0H0zm6 6h12v3h-4.5v9h-3V9H6V6Z" />
  </g>
);
