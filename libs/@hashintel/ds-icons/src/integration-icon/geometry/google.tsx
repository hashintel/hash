export const markLight = ({ id }: { id: string }) => (
  <g xmlSpace="preserve" fill="#4285F4">
    <defs>
      <linearGradient id={`${id}-a`}>
        <stop offset="0" stopColor="#0fbc5c" />
        <stop offset="1" stopColor="#0cba65" />
      </linearGradient>
      <linearGradient id={`${id}-g`}>
        <stop offset=".231" stopColor="#0fbc5f" />
        <stop offset=".312" stopColor="#0fbc5f" />
        <stop offset=".366" stopColor="#0fbc5e" />
        <stop offset=".458" stopColor="#0fbc5d" />
        <stop offset=".54" stopColor="#12bc58" />
        <stop offset=".699" stopColor="#28bf3c" />
        <stop offset=".771" stopColor="#38c02b" />
        <stop offset=".861" stopColor="#52c218" />
        <stop offset=".915" stopColor="#67c30f" />
        <stop offset="1" stopColor="#86c504" />
      </linearGradient>
      <linearGradient id={`${id}-h`}>
        <stop offset=".142" stopColor="#1abd4d" />
        <stop offset=".248" stopColor="#6ec30d" />
        <stop offset=".312" stopColor="#8ac502" />
        <stop offset=".366" stopColor="#a2c600" />
        <stop offset=".446" stopColor="#c8c903" />
        <stop offset=".54" stopColor="#ebcb03" />
        <stop offset=".616" stopColor="#f7cd07" />
        <stop offset=".699" stopColor="#fdcd04" />
        <stop offset=".771" stopColor="#fdce05" />
        <stop offset=".861" stopColor="#ffce0a" />
      </linearGradient>
      <linearGradient id={`${id}-f`}>
        <stop offset=".316" stopColor="#ff4c3c" />
        <stop offset=".604" stopColor="#ff692c" />
        <stop offset=".727" stopColor="#ff7825" />
        <stop offset=".885" stopColor="#ff8d1b" />
        <stop offset="1" stopColor="#ff9f13" />
      </linearGradient>
      <linearGradient id={`${id}-b`}>
        <stop offset=".231" stopColor="#ff4541" />
        <stop offset=".312" stopColor="#ff4540" />
        <stop offset=".458" stopColor="#ff4640" />
        <stop offset=".54" stopColor="#ff473f" />
        <stop offset=".699" stopColor="#ff5138" />
        <stop offset=".771" stopColor="#ff5b33" />
        <stop offset=".861" stopColor="#ff6c29" />
        <stop offset="1" stopColor="#ff8c18" />
      </linearGradient>
      <linearGradient id={`${id}-d`}>
        <stop offset=".408" stopColor="#fb4e5a" />
        <stop offset="1" stopColor="#ff4540" />
      </linearGradient>
      <linearGradient id={`${id}-c`}>
        <stop offset=".132" stopColor="#0cba65" />
        <stop offset=".21" stopColor="#0bb86d" />
        <stop offset=".297" stopColor="#09b479" />
        <stop offset=".396" stopColor="#08ad93" />
        <stop offset=".477" stopColor="#0aa6a9" />
        <stop offset=".568" stopColor="#0d9cc6" />
        <stop offset=".667" stopColor="#1893dd" />
        <stop offset=".769" stopColor="#258bf1" />
        <stop offset=".859" stopColor="#3086ff" />
      </linearGradient>
      <linearGradient id={`${id}-e`}>
        <stop offset=".366" stopColor="#ff4e3a" />
        <stop offset=".458" stopColor="#ff8a1b" />
        <stop offset=".54" stopColor="#ffa312" />
        <stop offset=".616" stopColor="#ffb60c" />
        <stop offset=".771" stopColor="#ffcd0a" />
        <stop offset=".861" stopColor="#fecf0a" />
        <stop offset=".915" stopColor="#fecf08" />
        <stop offset="1" stopColor="#fdcd01" />
      </linearGradient>
      <linearGradient
        xlinkHref={`#${id}-a`}
        id={`${id}-s`}
        x1="219.7"
        x2="254.467"
        y1="329.535"
        y2="329.535"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-b`}
        id={`${id}-m`}
        cx="109.627"
        cy="135.862"
        r="71.46"
        fx="109.627"
        fy="135.862"
        gradientTransform="matrix(-1.93688 1.043 1.45573 2.55542 290.525 -400.634)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-c`}
        id={`${id}-n`}
        cx="45.259"
        cy="279.274"
        r="71.46"
        fx="45.259"
        fy="279.274"
        gradientTransform="matrix(-3.5126 -4.45809 -1.69255 1.26062 870.8 191.554)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-d`}
        id={`${id}-l`}
        cx="304.017"
        cy="118.009"
        r="47.854"
        fx="304.017"
        fy="118.009"
        gradientTransform="matrix(2.06435 0 0 2.59204 -297.679 -151.747)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-e`}
        id={`${id}-o`}
        cx="181.001"
        cy="177.201"
        r="71.46"
        fx="181.001"
        fy="177.201"
        gradientTransform="matrix(-.24858 2.08314 2.96249 .33417 -255.146 -331.164)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-f`}
        id={`${id}-p`}
        cx="207.673"
        cy="108.097"
        r="41.102"
        fx="207.673"
        fy="108.097"
        gradientTransform="matrix(-1.2492 1.34326 -3.89684 -3.4257 880.501 194.905)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-g`}
        id={`${id}-r`}
        cx="109.627"
        cy="135.862"
        r="71.46"
        fx="109.627"
        fy="135.862"
        gradientTransform="matrix(-1.93688 -1.043 1.45573 -2.55542 290.525 838.683)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-h`}
        id={`${id}-j`}
        cx="154.87"
        cy="145.969"
        r="71.46"
        fx="154.87"
        fy="145.969"
        gradientTransform="matrix(-.0814 -1.93722 2.92674 -.11625 -215.135 632.86)"
        gradientUnits="userSpaceOnUse"
      />
      <filter
        id={`${id}-q`}
        width="1.097"
        height="1.116"
        x="-.048"
        y="-.058"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur stdDeviation="1.701" />
      </filter>
      <filter
        id={`${id}-k`}
        width="1.033"
        height="1.02"
        x="-.017"
        y="-.01"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur stdDeviation=".242" />
      </filter>
      <clipPath id={`${id}-i`} clipPathUnits="userSpaceOnUse">
        <path d="M371.378 193.24H237.083v53.438h77.167c-1.241 7.563-4.026 15.003-8.105 21.786-4.674 7.773-10.451 13.69-16.373 18.196-17.74 13.498-38.42 16.258-52.783 16.258-36.283 0-67.283-23.286-79.285-54.928-.484-1.149-.805-2.335-1.197-3.507a81.115 81.115 0 0 1-4.101-25.448c0-9.226 1.569-18.057 4.43-26.398 11.285-32.897 42.985-57.467 80.179-57.467 7.481 0 14.685.884 21.517 2.648a77.668 77.668 0 0 1 33.425 18.25l40.834-39.712c-24.839-22.616-57.219-36.32-95.844-36.32-30.878 0-59.386 9.553-82.748 25.7-18.945 13.093-34.483 30.625-44.97 50.985-9.753 18.879-15.094 39.8-15.094 62.294 0 22.495 5.35 43.633 15.103 62.337v.126c10.302 19.857 25.368 36.954 43.678 49.988 15.997 11.386 44.68 26.551 84.031 26.551 22.63 0 42.687-4.051 60.375-11.644 12.76-5.478 24.065-12.622 34.301-21.804 13.525-12.132 24.117-27.139 31.347-44.404 7.23-17.265 11.097-36.79 11.097-57.957 0-9.858-.998-19.87-2.689-28.968Z" />
      </clipPath>
    </defs>
    <g
      clipPath={`url(#${id}-i)`}
      transform="matrix(.95792 0 0 .98525 -90.174 -78.856)"
    >
      <path
        fill={`url(#${id}-j)`}
        d="M92.076 219.958c.148 22.14 6.501 44.983 16.117 63.424v.127c6.949 13.392 16.445 23.97 27.26 34.452l65.327-23.67c-12.36-6.235-14.246-10.055-23.105-17.026-9.054-9.066-15.802-19.473-20.004-31.677h-.17l.17-.127c-2.765-8.058-3.037-16.613-3.14-25.503Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-l)`}
        d="M237.083 79.025c-6.456 22.526-3.988 44.421 0 57.161 7.457.006 14.64.888 21.45 2.647a77.662 77.662 0 0 1 33.424 18.25l41.88-40.726c-24.81-22.59-54.667-37.297-96.754-37.332Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-m)`}
        d="M236.943 78.847c-31.67 0-60.91 9.798-84.871 26.359a145.533 145.533 0 0 0-24.332 21.15c-1.904 17.744 14.257 39.551 46.262 39.37 15.528-17.936 38.495-29.542 64.056-29.542l.07.002-1.044-57.335c-.048 0-.093-.004-.14-.004Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-n)`}
        d="m341.475 226.379-28.268 19.285c-1.24 7.562-4.028 15.002-8.107 21.786-4.674 7.772-10.45 13.69-16.373 18.196-17.702 13.47-38.328 16.244-52.687 16.255-14.842 25.102-17.444 37.675 1.043 57.934 22.877-.016 43.157-4.117 61.046-11.796 12.931-5.551 24.388-12.792 34.761-22.097 13.706-12.295 24.442-27.503 31.769-45 7.327-17.497 11.245-37.282 11.245-58.734Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill="#3086ff"
        d="M234.996 191.21v57.498h136.006c1.196-7.874 5.152-18.064 5.152-26.5 0-9.858-.996-21.899-2.687-30.998Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-o)`}
        d="M128.39 124.327c-8.394 9.119-15.564 19.326-21.249 30.364-9.753 18.879-15.094 41.83-15.094 64.324 0 .317.026.627.029.944 4.32 8.224 59.666 6.649 62.456 0-.004-.31-.039-.613-.039-.924 0-9.226 1.57-16.026 4.43-24.367 3.53-10.289 9.056-19.763 16.123-27.926 1.602-2.031 5.875-6.397 7.121-9.016.475-.997-.862-1.557-.937-1.908-.083-.393-1.876-.077-2.277-.37-1.275-.929-3.8-1.414-5.334-1.845-3.277-.921-8.708-2.953-11.725-5.06-9.536-6.658-24.417-14.612-33.505-24.216Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-p)`}
        d="M162.099 155.857c22.112 13.301 28.471-6.714 43.173-12.977l-25.574-52.664a144.74 144.74 0 0 0-26.543 14.504c-12.316 8.512-23.192 18.9-32.176 30.72Z"
        filter={`url(#${id}-q)`}
      />
      <path
        fill={`url(#${id}-r)`}
        d="M171.099 290.222c-29.683 10.641-34.33 11.023-37.062 29.29a144.806 144.806 0 0 0 16.792 13.984c15.996 11.386 46.766 26.551 86.118 26.551.046 0 .09-.004.137-.004v-59.157l-.094.002c-14.736 0-26.512-3.843-38.585-10.527-2.977-1.648-8.378 2.777-11.123.799-3.786-2.729-12.9 2.35-16.183-.938Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-s)`}
        d="M219.7 299.023v59.996c5.506.64 11.236 1.028 17.247 1.028 6.026 0 11.855-.307 17.52-.872v-59.748a105.119 105.119 0 0 1-17.477 1.461c-5.932 0-11.7-.686-17.29-1.865Z"
        filter={`url(#${id}-k)`}
        opacity=".5"
      />
    </g>
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g xmlSpace="preserve" fill="#4285F4">
    <defs>
      <linearGradient id={`${id}-a`}>
        <stop offset="0" stopColor="#0fbc5c" />
        <stop offset="1" stopColor="#0cba65" />
      </linearGradient>
      <linearGradient id={`${id}-g`}>
        <stop offset=".231" stopColor="#0fbc5f" />
        <stop offset=".312" stopColor="#0fbc5f" />
        <stop offset=".366" stopColor="#0fbc5e" />
        <stop offset=".458" stopColor="#0fbc5d" />
        <stop offset=".54" stopColor="#12bc58" />
        <stop offset=".699" stopColor="#28bf3c" />
        <stop offset=".771" stopColor="#38c02b" />
        <stop offset=".861" stopColor="#52c218" />
        <stop offset=".915" stopColor="#67c30f" />
        <stop offset="1" stopColor="#86c504" />
      </linearGradient>
      <linearGradient id={`${id}-h`}>
        <stop offset=".142" stopColor="#1abd4d" />
        <stop offset=".248" stopColor="#6ec30d" />
        <stop offset=".312" stopColor="#8ac502" />
        <stop offset=".366" stopColor="#a2c600" />
        <stop offset=".446" stopColor="#c8c903" />
        <stop offset=".54" stopColor="#ebcb03" />
        <stop offset=".616" stopColor="#f7cd07" />
        <stop offset=".699" stopColor="#fdcd04" />
        <stop offset=".771" stopColor="#fdce05" />
        <stop offset=".861" stopColor="#ffce0a" />
      </linearGradient>
      <linearGradient id={`${id}-f`}>
        <stop offset=".316" stopColor="#ff4c3c" />
        <stop offset=".604" stopColor="#ff692c" />
        <stop offset=".727" stopColor="#ff7825" />
        <stop offset=".885" stopColor="#ff8d1b" />
        <stop offset="1" stopColor="#ff9f13" />
      </linearGradient>
      <linearGradient id={`${id}-b`}>
        <stop offset=".231" stopColor="#ff4541" />
        <stop offset=".312" stopColor="#ff4540" />
        <stop offset=".458" stopColor="#ff4640" />
        <stop offset=".54" stopColor="#ff473f" />
        <stop offset=".699" stopColor="#ff5138" />
        <stop offset=".771" stopColor="#ff5b33" />
        <stop offset=".861" stopColor="#ff6c29" />
        <stop offset="1" stopColor="#ff8c18" />
      </linearGradient>
      <linearGradient id={`${id}-d`}>
        <stop offset=".408" stopColor="#fb4e5a" />
        <stop offset="1" stopColor="#ff4540" />
      </linearGradient>
      <linearGradient id={`${id}-c`}>
        <stop offset=".132" stopColor="#0cba65" />
        <stop offset=".21" stopColor="#0bb86d" />
        <stop offset=".297" stopColor="#09b479" />
        <stop offset=".396" stopColor="#08ad93" />
        <stop offset=".477" stopColor="#0aa6a9" />
        <stop offset=".568" stopColor="#0d9cc6" />
        <stop offset=".667" stopColor="#1893dd" />
        <stop offset=".769" stopColor="#258bf1" />
        <stop offset=".859" stopColor="#3086ff" />
      </linearGradient>
      <linearGradient id={`${id}-e`}>
        <stop offset=".366" stopColor="#ff4e3a" />
        <stop offset=".458" stopColor="#ff8a1b" />
        <stop offset=".54" stopColor="#ffa312" />
        <stop offset=".616" stopColor="#ffb60c" />
        <stop offset=".771" stopColor="#ffcd0a" />
        <stop offset=".861" stopColor="#fecf0a" />
        <stop offset=".915" stopColor="#fecf08" />
        <stop offset="1" stopColor="#fdcd01" />
      </linearGradient>
      <linearGradient
        xlinkHref={`#${id}-a`}
        id={`${id}-s`}
        x1="219.7"
        x2="254.467"
        y1="329.535"
        y2="329.535"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-b`}
        id={`${id}-m`}
        cx="109.627"
        cy="135.862"
        r="71.46"
        fx="109.627"
        fy="135.862"
        gradientTransform="matrix(-1.93688 1.043 1.45573 2.55542 290.525 -400.634)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-c`}
        id={`${id}-n`}
        cx="45.259"
        cy="279.274"
        r="71.46"
        fx="45.259"
        fy="279.274"
        gradientTransform="matrix(-3.5126 -4.45809 -1.69255 1.26062 870.8 191.554)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-d`}
        id={`${id}-l`}
        cx="304.017"
        cy="118.009"
        r="47.854"
        fx="304.017"
        fy="118.009"
        gradientTransform="matrix(2.06435 0 0 2.59204 -297.679 -151.747)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-e`}
        id={`${id}-o`}
        cx="181.001"
        cy="177.201"
        r="71.46"
        fx="181.001"
        fy="177.201"
        gradientTransform="matrix(-.24858 2.08314 2.96249 .33417 -255.146 -331.164)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-f`}
        id={`${id}-p`}
        cx="207.673"
        cy="108.097"
        r="41.102"
        fx="207.673"
        fy="108.097"
        gradientTransform="matrix(-1.2492 1.34326 -3.89684 -3.4257 880.501 194.905)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-g`}
        id={`${id}-r`}
        cx="109.627"
        cy="135.862"
        r="71.46"
        fx="109.627"
        fy="135.862"
        gradientTransform="matrix(-1.93688 -1.043 1.45573 -2.55542 290.525 838.683)"
        gradientUnits="userSpaceOnUse"
      />
      <radialGradient
        xlinkHref={`#${id}-h`}
        id={`${id}-j`}
        cx="154.87"
        cy="145.969"
        r="71.46"
        fx="154.87"
        fy="145.969"
        gradientTransform="matrix(-.0814 -1.93722 2.92674 -.11625 -215.135 632.86)"
        gradientUnits="userSpaceOnUse"
      />
      <filter
        id={`${id}-q`}
        width="1.097"
        height="1.116"
        x="-.048"
        y="-.058"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur stdDeviation="1.701" />
      </filter>
      <filter
        id={`${id}-k`}
        width="1.033"
        height="1.02"
        x="-.017"
        y="-.01"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur stdDeviation=".242" />
      </filter>
      <clipPath id={`${id}-i`} clipPathUnits="userSpaceOnUse">
        <path d="M371.378 193.24H237.083v53.438h77.167c-1.241 7.563-4.026 15.003-8.105 21.786-4.674 7.773-10.451 13.69-16.373 18.196-17.74 13.498-38.42 16.258-52.783 16.258-36.283 0-67.283-23.286-79.285-54.928-.484-1.149-.805-2.335-1.197-3.507a81.115 81.115 0 0 1-4.101-25.448c0-9.226 1.569-18.057 4.43-26.398 11.285-32.897 42.985-57.467 80.179-57.467 7.481 0 14.685.884 21.517 2.648a77.668 77.668 0 0 1 33.425 18.25l40.834-39.712c-24.839-22.616-57.219-36.32-95.844-36.32-30.878 0-59.386 9.553-82.748 25.7-18.945 13.093-34.483 30.625-44.97 50.985-9.753 18.879-15.094 39.8-15.094 62.294 0 22.495 5.35 43.633 15.103 62.337v.126c10.302 19.857 25.368 36.954 43.678 49.988 15.997 11.386 44.68 26.551 84.031 26.551 22.63 0 42.687-4.051 60.375-11.644 12.76-5.478 24.065-12.622 34.301-21.804 13.525-12.132 24.117-27.139 31.347-44.404 7.23-17.265 11.097-36.79 11.097-57.957 0-9.858-.998-19.87-2.689-28.968Z" />
      </clipPath>
    </defs>
    <g
      clipPath={`url(#${id}-i)`}
      transform="matrix(.95792 0 0 .98525 -90.174 -78.856)"
    >
      <path
        fill={`url(#${id}-j)`}
        d="M92.076 219.958c.148 22.14 6.501 44.983 16.117 63.424v.127c6.949 13.392 16.445 23.97 27.26 34.452l65.327-23.67c-12.36-6.235-14.246-10.055-23.105-17.026-9.054-9.066-15.802-19.473-20.004-31.677h-.17l.17-.127c-2.765-8.058-3.037-16.613-3.14-25.503Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-l)`}
        d="M237.083 79.025c-6.456 22.526-3.988 44.421 0 57.161 7.457.006 14.64.888 21.45 2.647a77.662 77.662 0 0 1 33.424 18.25l41.88-40.726c-24.81-22.59-54.667-37.297-96.754-37.332Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-m)`}
        d="M236.943 78.847c-31.67 0-60.91 9.798-84.871 26.359a145.533 145.533 0 0 0-24.332 21.15c-1.904 17.744 14.257 39.551 46.262 39.37 15.528-17.936 38.495-29.542 64.056-29.542l.07.002-1.044-57.335c-.048 0-.093-.004-.14-.004Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-n)`}
        d="m341.475 226.379-28.268 19.285c-1.24 7.562-4.028 15.002-8.107 21.786-4.674 7.772-10.45 13.69-16.373 18.196-17.702 13.47-38.328 16.244-52.687 16.255-14.842 25.102-17.444 37.675 1.043 57.934 22.877-.016 43.157-4.117 61.046-11.796 12.931-5.551 24.388-12.792 34.761-22.097 13.706-12.295 24.442-27.503 31.769-45 7.327-17.497 11.245-37.282 11.245-58.734Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill="#3086ff"
        d="M234.996 191.21v57.498h136.006c1.196-7.874 5.152-18.064 5.152-26.5 0-9.858-.996-21.899-2.687-30.998Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-o)`}
        d="M128.39 124.327c-8.394 9.119-15.564 19.326-21.249 30.364-9.753 18.879-15.094 41.83-15.094 64.324 0 .317.026.627.029.944 4.32 8.224 59.666 6.649 62.456 0-.004-.31-.039-.613-.039-.924 0-9.226 1.57-16.026 4.43-24.367 3.53-10.289 9.056-19.763 16.123-27.926 1.602-2.031 5.875-6.397 7.121-9.016.475-.997-.862-1.557-.937-1.908-.083-.393-1.876-.077-2.277-.37-1.275-.929-3.8-1.414-5.334-1.845-3.277-.921-8.708-2.953-11.725-5.06-9.536-6.658-24.417-14.612-33.505-24.216Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-p)`}
        d="M162.099 155.857c22.112 13.301 28.471-6.714 43.173-12.977l-25.574-52.664a144.74 144.74 0 0 0-26.543 14.504c-12.316 8.512-23.192 18.9-32.176 30.72Z"
        filter={`url(#${id}-q)`}
      />
      <path
        fill={`url(#${id}-r)`}
        d="M171.099 290.222c-29.683 10.641-34.33 11.023-37.062 29.29a144.806 144.806 0 0 0 16.792 13.984c15.996 11.386 46.766 26.551 86.118 26.551.046 0 .09-.004.137-.004v-59.157l-.094.002c-14.736 0-26.512-3.843-38.585-10.527-2.977-1.648-8.378 2.777-11.123.799-3.786-2.729-12.9 2.35-16.183-.938Z"
        filter={`url(#${id}-k)`}
      />
      <path
        fill={`url(#${id}-s)`}
        d="M219.7 299.023v59.996c5.506.64 11.236 1.028 17.247 1.028 6.026 0 11.855-.307 17.52-.872v-59.748a105.119 105.119 0 0 1-17.477 1.461c-5.932 0-11.7-.686-17.29-1.865Z"
        filter={`url(#${id}-k)`}
        opacity=".5"
      />
    </g>
  </g>
);
export const logoLight = ({ id: _id }: { id: string }) => (
  <svg viewBox="0 0.226601 270.413333 89.507389" fill="#111111">
    <path
      fill="#EA4335"
      d="M115.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18C71.25 34.32 81.24 25 93.5 25s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44S80.99 39.2 80.99 47.18c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z"
    />
    <path
      fill="#FBBC05"
      d="M163.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.85 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44s-12.51 5.46-12.51 13.44c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z"
    />
    <path
      fill="#4285F4"
      d="M209.75 26.34v39.82c0 16.38-9.66 23.07-21.08 23.07-10.75 0-17.22-7.19-19.66-13.07l8.48-3.53c1.51 3.61 5.21 7.87 11.17 7.87 7.31 0 11.84-4.51 11.84-13v-3.19h-.34c-2.18 2.69-6.38 5.04-11.68 5.04-11.09 0-21.25-9.66-21.25-22.09 0-12.52 10.16-22.26 21.25-22.26 5.29 0 9.49 2.35 11.68 4.96h.34v-3.61h9.25zm-8.56 20.92c0-7.81-5.21-13.52-11.84-13.52-6.72 0-12.35 5.71-12.35 13.52 0 7.73 5.63 13.36 12.35 13.36 6.63 0 11.84-5.63 11.84-13.36z"
    />
    <path fill="#34A853" d="M225 3v65h-9.5V3h9.5z" />
    <path
      fill="#EA4335"
      d="M262.02 54.48l7.56 5.04c-2.44 3.61-8.32 9.83-18.48 9.83-12.6 0-22.01-9.74-22.01-22.18 0-13.19 9.49-22.18 20.92-22.18 11.51 0 17.14 9.16 18.98 14.11l1.01 2.52-29.65 12.28c2.27 4.45 5.8 6.72 10.75 6.72 4.96 0 8.4-2.44 10.92-6.14zm-23.27-7.98l19.82-8.23c-1.09-2.77-4.37-4.7-8.23-4.7-4.95 0-11.84 4.37-11.59 12.93z"
    />
    <path
      fill="#4285F4"
      d="M35.29 41.41V32H67c.31 1.64.47 3.58.47 5.68 0 7.06-1.93 15.79-8.15 22.01-6.05 6.3-13.78 9.66-24.02 9.66C16.32 69.35.36 53.89.36 34.91.36 15.93 16.32.47 35.3.47c10.5 0 17.98 4.12 23.6 9.49l-6.64 6.64c-4.03-3.78-9.49-6.72-16.97-6.72-13.86 0-24.7 11.17-24.7 25.03 0 13.86 10.84 25.03 24.7 25.03 8.99 0 14.11-3.61 17.39-6.89 2.66-2.66 4.41-6.46 5.1-11.65l-22.49.01z"
    />
  </svg>
);
export const logoDark = ({ id: _id }: { id: string }) => (
  <svg viewBox="0 0.226601 270.413333 89.507389" fill="#F5F7FA">
    <path
      fill="#EA4335"
      d="M115.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18C71.25 34.32 81.24 25 93.5 25s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44S80.99 39.2 80.99 47.18c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z"
    />
    <path
      fill="#FBBC05"
      d="M163.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.85 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44s-12.51 5.46-12.51 13.44c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z"
    />
    <path
      fill="#4285F4"
      d="M209.75 26.34v39.82c0 16.38-9.66 23.07-21.08 23.07-10.75 0-17.22-7.19-19.66-13.07l8.48-3.53c1.51 3.61 5.21 7.87 11.17 7.87 7.31 0 11.84-4.51 11.84-13v-3.19h-.34c-2.18 2.69-6.38 5.04-11.68 5.04-11.09 0-21.25-9.66-21.25-22.09 0-12.52 10.16-22.26 21.25-22.26 5.29 0 9.49 2.35 11.68 4.96h.34v-3.61h9.25zm-8.56 20.92c0-7.81-5.21-13.52-11.84-13.52-6.72 0-12.35 5.71-12.35 13.52 0 7.73 5.63 13.36 12.35 13.36 6.63 0 11.84-5.63 11.84-13.36z"
    />
    <path fill="#34A853" d="M225 3v65h-9.5V3h9.5z" />
    <path
      fill="#EA4335"
      d="M262.02 54.48l7.56 5.04c-2.44 3.61-8.32 9.83-18.48 9.83-12.6 0-22.01-9.74-22.01-22.18 0-13.19 9.49-22.18 20.92-22.18 11.51 0 17.14 9.16 18.98 14.11l1.01 2.52-29.65 12.28c2.27 4.45 5.8 6.72 10.75 6.72 4.96 0 8.4-2.44 10.92-6.14zm-23.27-7.98l19.82-8.23c-1.09-2.77-4.37-4.7-8.23-4.7-4.95 0-11.84 4.37-11.59 12.93z"
    />
    <path
      fill="#4285F4"
      d="M35.29 41.41V32H67c.31 1.64.47 3.58.47 5.68 0 7.06-1.93 15.79-8.15 22.01-6.05 6.3-13.78 9.66-24.02 9.66C16.32 69.35.36 53.89.36 34.91.36 15.93 16.32.47 35.3.47c10.5 0 17.98 4.12 23.6 9.49l-6.64 6.64c-4.03-3.78-9.49-6.72-16.97-6.72-13.86 0-24.7 11.17-24.7 25.03 0 13.86 10.84 25.03 24.7 25.03 8.99 0 14.11-3.61 17.39-6.89 2.66-2.66 4.41-6.46 5.1-11.65l-22.49.01z"
    />
  </svg>
);
const WordmarkLightSource = logoLight;
export const wordmarkLight = ({ id }: { id: string }) => (
  <svg viewBox="0.15774 3.08994 270.09785 84.00618" overflow="hidden">
    <defs>
      <clipPath id={`${id}-wordmark-crop`} clipPathUnits="userSpaceOnUse">
        <rect x="0.15774" y="3.08994" width="270.09785" height="84.00618" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-wordmark-crop)`}>
      <svg x="0" y="0.226601" width="270.413333" height="89.507389">
        <WordmarkLightSource id={id} />
      </svg>
    </g>
  </svg>
);
const WordmarkDarkSource = logoDark;
export const wordmarkDark = ({ id }: { id: string }) => (
  <svg viewBox="0.15774 3.08994 270.09785 84.00618" overflow="hidden">
    <defs>
      <clipPath id={`${id}-wordmark-crop`} clipPathUnits="userSpaceOnUse">
        <rect x="0.15774" y="3.08994" width="270.09785" height="84.00618" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-wordmark-crop)`}>
      <svg x="0" y="0.226601" width="270.413333" height="89.507389">
        <WordmarkDarkSource id={id} />
      </svg>
    </g>
  </svg>
);
