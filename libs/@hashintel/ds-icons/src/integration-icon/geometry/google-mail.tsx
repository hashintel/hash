export const markLight = ({ id }: { id: string }) => (
  <g fill="none">
    <mask
      id={`${id}-mask0_8474_23719`}
      x="0"
      y="0"
      width="32"
      height="24"
      maskUnits="userSpaceOnUse"
      style={{ maskType: "luminance" }}
    >
      <path d="M31.8407 0H0V24H31.8407V0Z" fill="white" />
    </mask>
    <g mask={`url(#${id}-mask0_8474_23719)`}>
      <path
        d="M2.17096 24.0001H7.23654V11.6364L0 6.18188V21.8182C0 23.0255 0.973316 24.0001 2.17096 24.0001Z"
        fill="#4285F4"
      />
      <path
        d="M24.6041 24.0001H29.6697C30.8711 24.0001 31.8407 23.0219 31.8407 21.8182V6.18188L24.6041 11.6364"
        fill="#34A853"
      />
      <path
        d="M24.6041 2.1819V11.6364L31.8407 6.18191V3.27282C31.8407 0.574632 28.7761 -0.96355 26.6304 0.654631"
        fill="#FBBC04"
      />
      <path
        d="M7.23657 11.6364V2.18188L15.9204 8.72733L24.6042 2.18188V11.6364L15.9204 18.1819"
        fill="#EA4335"
      />
      <path
        d="M0 3.27282V6.18191L7.23654 11.6364V2.1819L5.21032 0.654631C3.06106 -0.96355 0 0.574632 0 3.27282Z"
        fill="#C5221F"
      />
    </g>
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g fill="none">
    <mask
      id={`${id}-mask0_8474_23719`}
      x="0"
      y="0"
      width="32"
      height="24"
      maskUnits="userSpaceOnUse"
      style={{ maskType: "luminance" }}
    >
      <path d="M31.8407 0H0V24H31.8407V0Z" fill="white" />
    </mask>
    <g mask={`url(#${id}-mask0_8474_23719)`}>
      <path
        d="M2.17096 24.0001H7.23654V11.6364L0 6.18188V21.8182C0 23.0255 0.973316 24.0001 2.17096 24.0001Z"
        fill="#4285F4"
      />
      <path
        d="M24.6041 24.0001H29.6697C30.8711 24.0001 31.8407 23.0219 31.8407 21.8182V6.18188L24.6041 11.6364"
        fill="#34A853"
      />
      <path
        d="M24.6041 2.1819V11.6364L31.8407 6.18191V3.27282C31.8407 0.574632 28.7761 -0.96355 26.6304 0.654631"
        fill="#FBBC04"
      />
      <path
        d="M7.23657 11.6364V2.18188L15.9204 8.72733L24.6042 2.18188V11.6364L15.9204 18.1819"
        fill="#EA4335"
      />
      <path
        d="M0 3.27282V6.18191L7.23654 11.6364V2.1819L5.21032 0.654631C3.06106 -0.96355 0 0.574632 0 3.27282Z"
        fill="#C5221F"
      />
    </g>
  </g>
);
export const logoLight = ({ id: _id }: { id: string }) => (
  <svg viewBox="0 13 218 51" fill="#000000">
    <image
      width="218"
      height="80"
      href="data:image/png;base64,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"
    />
  </svg>
);
export const logoDark = ({ id }: { id: string }) => (
  <svg viewBox="0 13 218 51" fill="#000000">
    <defs>
      <image
        width="218"
        height="80"
        href="data:image/png;base64,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"
        id={`${id}-original-logo`}
      />
      <clipPath id={`${id}-brand`}>
        <rect x="0" y="0" width="74" height="80" />
      </clipPath>
      <clipPath id={`${id}-wordmark`}>
        <rect x="74" y="0" width="144" height="80" />
      </clipPath>
      <filter id={`${id}-wordmark-color`} colorInterpolationFilters="sRGB">
        <feFlood floodColor="#F5F7FA" />
        <feComposite in2="SourceAlpha" operator="in" />
      </filter>
    </defs>
    <use href={`#${id}-original-logo`} clipPath={`url(#${id}-brand)`} />
    <use
      href={`#${id}-original-logo`}
      clipPath={`url(#${id}-wordmark)`}
      filter={`url(#${id}-wordmark-color)`}
    />
  </svg>
);
const WordmarkLightSource = logoLight;
export const wordmarkLight = ({ id }: { id: string }) => (
  <svg viewBox="84.60217 24.37972 111.289 33.14093" overflow="hidden">
    <defs>
      <clipPath id={`${id}-wordmark-crop`} clipPathUnits="userSpaceOnUse">
        <rect x="84.60217" y="24.37972" width="111.289" height="33.14093" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-wordmark-crop)`}>
      <svg x="0" y="13" width="218" height="51">
        <WordmarkLightSource id={id} />
      </svg>
    </g>
  </svg>
);
const WordmarkDarkSource = logoDark;
export const wordmarkDark = ({ id }: { id: string }) => (
  <svg viewBox="84.60217 24.37972 111.289 33.14093" overflow="hidden">
    <defs>
      <clipPath id={`${id}-wordmark-crop`} clipPathUnits="userSpaceOnUse">
        <rect x="84.60217" y="24.37972" width="111.289" height="33.14093" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-wordmark-crop)`}>
      <svg x="0" y="13" width="218" height="51">
        <WordmarkDarkSource id={id} />
      </svg>
    </g>
  </svg>
);
