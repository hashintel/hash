export const markLight = ({ id }: { id: string }) => (
  <g id={`${id}-artwork`} fill="#111111">
    <defs>
      <linearGradient
        id={`${id}-linear-gradient`}
        x1="13.22"
        y1="-130.02"
        x2="50.78"
        y2="-161.53"
        gradientTransform="matrix(1, 0, 0, -1, 0, -113.78)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#ff0" />
        <stop offset="0.27" stopColor="#fef10c" />
        <stop offset="0.45" stopColor="#fde516" />
        <stop offset="0.64" stopColor="#fde113" />
        <stop offset="0.82" stopColor="#fed508" />
        <stop offset="0.92" stopColor="#fc0" />
      </linearGradient>
      <linearGradient
        id={`${id}-linear-gradient-2`}
        x1="38.93"
        y1="-154.54"
        x2="50.6"
        y2="-161.84"
        gradientTransform="matrix(1, 0, 0, -1, 0, -113.78)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0.1" stopColor="#874400" />
        <stop offset="0.26" stopColor="#d88a00" />
        <stop offset="0.37" stopColor="#e79d00" />
        <stop offset="0.52" stopColor="#f2b400" />
        <stop offset="0.7" stopColor="#fad202" />
        <stop offset="0.9" stopColor="#fedf03" />
      </linearGradient>
    </defs>
    <polyline
      points="32 0 64 32 32 64 0 32 32 0"
      fill={`url(#${id}-linear-gradient)`}
    />
    <polygon
      points="44.15 35.24 32 64 32 64 64 32 55.69 23.68 44.15 35.24"
      fill={`url(#${id}-linear-gradient-2)`}
    />
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g id={`${id}-artwork`} fill="#F5F7FA">
    <defs>
      <linearGradient
        id={`${id}-linear-gradient`}
        x1="13.22"
        y1="-130.02"
        x2="50.78"
        y2="-161.53"
        gradientTransform="matrix(1, 0, 0, -1, 0, -113.78)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#ff0" />
        <stop offset="0.27" stopColor="#fef10c" />
        <stop offset="0.45" stopColor="#fde516" />
        <stop offset="0.64" stopColor="#fde113" />
        <stop offset="0.82" stopColor="#fed508" />
        <stop offset="0.92" stopColor="#fc0" />
      </linearGradient>
      <linearGradient
        id={`${id}-linear-gradient-2`}
        x1="38.93"
        y1="-154.54"
        x2="50.6"
        y2="-161.84"
        gradientTransform="matrix(1, 0, 0, -1, 0, -113.78)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0.1" stopColor="#FFAE5C" />
        <stop offset="0.26" stopColor="#d88a00" />
        <stop offset="0.37" stopColor="#e79d00" />
        <stop offset="0.52" stopColor="#f2b400" />
        <stop offset="0.7" stopColor="#fad202" />
        <stop offset="0.9" stopColor="#fedf03" />
      </linearGradient>
    </defs>
    <polyline
      points="32 0 64 32 32 64 0 32 32 0"
      fill={`url(#${id}-linear-gradient)`}
    />
    <polygon
      points="44.15 35.24 32 64 32 64 64 32 55.69 23.68 44.15 35.24"
      fill={`url(#${id}-linear-gradient-2)`}
    />
  </g>
);
export const markMono = ({ id }: { id: string }) => (
  <g id={`${id}-artwork`} fill="#111111">
    <defs>
      <linearGradient
        id={`${id}-linear-gradient`}
        x1="13.22"
        y1="-130.02"
        x2="50.78"
        y2="-161.53"
        gradientTransform="matrix(1, 0, 0, -1, 0, -113.78)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#000000" />
        <stop offset="0.27" stopColor="#000000" />
        <stop offset="0.45" stopColor="#000000" />
        <stop offset="0.64" stopColor="#000000" />
        <stop offset="0.82" stopColor="#000000" />
        <stop offset="0.92" stopColor="#000000" />
      </linearGradient>
      <linearGradient
        id={`${id}-linear-gradient-2`}
        x1="38.93"
        y1="-154.54"
        x2="50.6"
        y2="-161.84"
        gradientTransform="matrix(1, 0, 0, -1, 0, -113.78)"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0.1" stopColor="#707070" />
        <stop offset="0.26" stopColor="#606060" />
        <stop offset="0.37" stopColor="#505050" />
        <stop offset="0.52" stopColor="#404040" />
        <stop offset="0.7" stopColor="#303030" />
        <stop offset="0.9" stopColor="#202020" />
      </linearGradient>
    </defs>
    <polyline
      points="32 0 64 32 32 64 0 32 32 0"
      fill={`url(#${id}-linear-gradient)`}
    />
    <polygon
      points="44.15 35.24 32 64 32 64 64 32 55.69 23.68 44.15 35.24"
      fill={`url(#${id}-linear-gradient-2)`}
    />
  </g>
);
