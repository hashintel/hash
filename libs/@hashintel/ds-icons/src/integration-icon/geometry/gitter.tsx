export const markLight = ({ id }: { id: string }) => (
  <g fill="#ED1965">
    <defs>
      <linearGradient
        x1="50%"
        y1="0%"
        x2="50%"
        y2="100%"
        id={`${id}-linearGradient-1`}
      >
        <stop stopColor="#FB0766" offset="0%" />
        <stop stopColor="#C50948" offset="100%" />
      </linearGradient>
    </defs>
    <g>
      <path
        d="M0,0 L256,0 L256,256 L0,256 L0,0 Z"
        fill={`url(#${id}-linearGradient-1)`}
      />
      <path
        d="M83.914,62.873 L96.439,62.873 L96.439,145.534 L83.914,145.534 L83.914,62.873 Z M160.063,82.912 L172.587,82.912 L172.587,145.534 L160.063,145.534 L160.063,82.912 Z M109.464,82.912 L121.988,82.912 L121.988,193.378 L109.464,193.378 L109.464,82.912 Z M134.513,82.912 L147.038,82.912 L147.038,193.378 L134.513,193.378 L134.513,82.912 Z"
        fill="#FFFFFF"
      />
    </g>
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g fill="#EF3074">
    <defs>
      <linearGradient
        x1="50%"
        y1="0%"
        x2="50%"
        y2="100%"
        id={`${id}-linearGradient-1`}
      >
        <stop stopColor="#FB0968" offset="0%" />
        <stop stopColor="#D6537F" offset="100%" />
      </linearGradient>
    </defs>
    <g>
      <path
        d="M0,0 L256,0 L256,256 L0,256 L0,0 Z"
        fill={`url(#${id}-linearGradient-1)`}
      />
      <path
        d="M83.914,62.873 L96.439,62.873 L96.439,145.534 L83.914,145.534 L83.914,62.873 Z M160.063,82.912 L172.587,82.912 L172.587,145.534 L160.063,145.534 L160.063,82.912 Z M109.464,82.912 L121.988,82.912 L121.988,193.378 L109.464,193.378 L109.464,82.912 Z M134.513,82.912 L147.038,82.912 L147.038,193.378 L134.513,193.378 L134.513,82.912 Z"
        fill="#FFFFFF"
      />
    </g>
  </g>
);
