export const markLight = ({ id }: { id: string }) => (
  <g fill="#0052CC">
    <defs>
      <linearGradient
        x1="99.7%"
        y1="15.8%"
        x2="39.8%"
        y2="97.4%"
        id={`${id}-a`}
      >
        <stop stopColor="#0052CC" offset="0%" />
        <stop stopColor="#2684FF" offset="92.3%" />
      </linearGradient>
    </defs>
    <path
      d="M76 118c-4-4-10-4-13 1L1 245a7 7 0 0 0 6 10h88c3 0 5-1 6-4 19-39 8-98-25-133Z"
      fill={`url(#${id}-a)`}
    />
    <path
      d="M122 4c-35 56-33 117-10 163l42 84c1 3 4 4 7 4h87a7 7 0 0 0 7-10L134 4c-2-5-9-5-12 0Z"
      fill="#2681FF"
    />
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g fill="#4581DA">
    <defs>
      <linearGradient
        x1="99.7%"
        y1="15.8%"
        x2="39.8%"
        y2="97.4%"
        id={`${id}-a`}
      >
        <stop stopColor="#4581DA" offset="0%" />
        <stop stopColor="#2684FF" offset="92.3%" />
      </linearGradient>
    </defs>
    <path
      d="M76 118c-4-4-10-4-13 1L1 245a7 7 0 0 0 6 10h88c3 0 5-1 6-4 19-39 8-98-25-133Z"
      fill={`url(#${id}-a)`}
    />
    <path
      d="M122 4c-35 56-33 117-10 163l42 84c1 3 4 4 7 4h87a7 7 0 0 0 7-10L134 4c-2-5-9-5-12 0Z"
      fill="#2681FF"
    />
  </g>
);
