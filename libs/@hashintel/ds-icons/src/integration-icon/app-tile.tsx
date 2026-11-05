export const AppTileLight = ({ id }: { id: string }) => (
  <g>
    <defs>
      <linearGradient
        id={`${id}-surface`}
        x1="6"
        y1="0"
        x2="58"
        y2="64"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#F3F7FA" stopOpacity=".82" />
        <stop offset=".48" stopColor="#DCE5ED" stopOpacity=".64" />
        <stop offset="1" stopColor="#E8EFF5" stopOpacity=".78" />
      </linearGradient>
      <radialGradient
        id={`${id}-sheen`}
        cx="3"
        cy="2"
        r="62"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#FFFFFF" stopOpacity=".64" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      <linearGradient
        id={`${id}-reflection`}
        x1="0"
        y1="0"
        x2="64"
        y2="64"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#FFFFFF" stopOpacity=".98" />
        <stop offset=".23" stopColor="#FFFFFF" stopOpacity=".25" />
        <stop offset=".5" stopColor="#FFFFFF" stopOpacity="0" />
        <stop offset=".78" stopColor="#FFFFFF" stopOpacity=".18" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity=".8" />
      </linearGradient>
    </defs>
    <rect
      x=".5"
      y=".5"
      width="63"
      height="63"
      rx="10"
      fill={`url(#${id}-surface)`}
      stroke="#526E86"
      strokeOpacity=".28"
    />
    <rect
      x=".5"
      y=".5"
      width="63"
      height="63"
      rx="10"
      fill={`url(#${id}-sheen)`}
    />
    <rect
      x="1.25"
      y="1.25"
      width="61.5"
      height="61.5"
      rx="9.25"
      stroke={`url(#${id}-reflection)`}
      strokeWidth="1.5"
    />
  </g>
);
export const AppTileDark = ({ id }: { id: string }) => (
  <g>
    <defs>
      <linearGradient
        id={`${id}-surface`}
        x1="6"
        y1="0"
        x2="58"
        y2="64"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="#526678" stopOpacity=".50" />
        <stop offset=".48" stopColor="#273746" stopOpacity=".62" />
        <stop offset="1" stopColor="#364A5C" stopOpacity=".54" />
      </linearGradient>
      <radialGradient
        id={`${id}-sheen`}
        cx="3"
        cy="2"
        r="62"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#FFFFFF" stopOpacity=".18" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      <linearGradient
        id={`${id}-reflection`}
        x1="0"
        y1="0"
        x2="64"
        y2="64"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#FFFFFF" stopOpacity=".75" />
        <stop offset=".23" stopColor="#FFFFFF" stopOpacity=".08" />
        <stop offset=".5" stopColor="#FFFFFF" stopOpacity="0" />
        <stop offset=".78" stopColor="#FFFFFF" stopOpacity=".04" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity=".45" />
      </linearGradient>
    </defs>
    <rect
      x=".5"
      y=".5"
      width="63"
      height="63"
      rx="10"
      fill={`url(#${id}-surface)`}
      stroke="#526E86"
      strokeOpacity=".7"
    />
    <rect
      x=".5"
      y=".5"
      width="63"
      height="63"
      rx="10"
      fill={`url(#${id}-sheen)`}
    />
    <rect
      x="1.25"
      y="1.25"
      width="61.5"
      height="61.5"
      rx="9.25"
      stroke={`url(#${id}-reflection)`}
      strokeWidth="1.5"
    />
  </g>
);
