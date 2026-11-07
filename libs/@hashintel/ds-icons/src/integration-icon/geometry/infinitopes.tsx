/* Brand names and artwork remain trademarks of their respective owners. Bounds and theme colors adjusted; app tiles composed. */
export const markLight = ({ id }: { id: string }) => (
  <g fill="none">
    <defs>
      <clipPath id={`${id}-brand-symbol-bounds`}>
        <rect x="0.0" y="0.56685" width="88.2" height="113.43315" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-brand-symbol-bounds)`}>
      <g clipPath={`url(#${id}-a)`}>
        <path
          d="M100.6 46.597c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm26.3 22c0 1.1-.9 2-2 2-1.2 0-2-.9-2-2v-21.6c0-.6.3-1.3.8-1.7.9-.6 2.2-.4 2.8.4l12 16.6v-15.3c0-1.1.9-2 2-2s2 .9 2 2v21.6c0 1.1-.9 2-2 2-.6 0-1.2-.3-1.5-.7l-.2-.2-11.9-16.5v15.4Zm35.7 0v-21.9c0-1.1.9-2 2-2h12.1c1.1 0 2 .9 2 2 0 1.2-1 2.1-2 2.1h-10.1v6.8h8.7c1.1 0 2 1 2 2 0 1.2-.9 2.1-2 2.1h-8.7v8.9c0 1.1-.9 2-2.1 2-1 0-1.9-.9-1.9-2Zm33.9-22c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm26.3 22c0 1.1-.9 2-2 2-1.2 0-2-.9-2-2v-21.6c0-.6.3-1.3.8-1.7.9-.6 2.2-.4 2.8.4l12 16.6v-15.3c0-1.1.9-2 2-2s2 .9 2 2v21.6c0 1.1-.9 2-2 2-.6 0-1.2-.3-1.5-.7l-.2-.2-11.9-16.5v15.4Zm34.7-22c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm38.1 2.1h-5.9v19.8c0 1.2-.9 2-2 2s-2-.9-2-2v-19.8h-5.9c-1.2 0-2-1-2-2.1 0-1.2.9-2 2-2h15.9c1.1 0 2 .9 2 2s-.9 2.1-2.1 2.1Zm37.8-.9c2.3 2.5 3.8 5.7 3.8 9.4s-1.4 7-3.8 9.4c-2.2 2.4-5.5 4-8.9 4-3.6 0-6.8-1.6-9.1-4s-3.7-5.7-3.7-9.4 1.4-7 3.7-9.4c2.3-2.5 5.5-4 9.1-4 3.5 0 6.7 1.6 8.9 4Zm-.4 9.4c0-2.5-1-4.9-2.5-6.5-1.6-1.7-3.6-2.6-5.9-2.6-2.4 0-4.5 1-6 2.6-1.6 1.6-2.5 4-2.5 6.5s1 4.9 2.5 6.5c1.6 1.7 3.6 2.7 6 2.7 2.2 0 4.3-1 5.9-2.7 1.5-1.6 2.5-4 2.5-6.5Zm31.4 3.3h-4.6v8.1c0 1.1-.9 2-2.1 2-1.1 0-2-.9-2-2v-21.9c0-1.2.9-2 2-2h6.6c4.4 0 8 3.6 8 8 .1 4.2-3.5 7.8-7.9 7.8Zm-4.6-4.1h4.6c2.2 0 3.8-1.7 3.9-3.8 0-2.2-1.7-3.9-3.9-3.9h-4.6v7.7Zm28.7 12.2v-21.9c0-1.2.9-2 2-2h12.1c1.1 0 2 .9 2 2 0 1.2-1 2.1-2 2.1h-10.1v6.8h8.7c1.1 0 2 1 2 2 0 1.2-.9 2.1-2 2.1h-8.7v6.8h10.1c1.1 0 2 .9 2 2.1 0 1.1-1 2-2 2h-12.1c-1.1 0-2-.9-2-2Zm32.4-4.5c.7-.8 1.9-.9 2.7-.3 1.6 1.3 4.5 2.9 7.1 2.9 1.9 0 3.5-.6 4.6-1.4 1.1-.8 1.6-1.7 1.6-2.7 0-.5-.1-.8-.3-1.2-.2-.4-.6-.7-1.1-1.1-1.1-.7-2.9-1.3-5.1-1.7h-.1c-1.7-.3-3.4-.8-4.8-1.4-1.4-.7-2.6-1.6-3.5-2.9-.6-.9-.9-1.9-.9-3 0-2.2 1.3-4.2 3-5.4 1.7-1.3 4-2 6.4-2 3.6 0 6.2 1.7 8.1 3 .9.6 1.1 1.8.5 2.6-.6.9-1.7 1.2-2.6.6-1.9-1.3-3.7-2.4-6-2.4-1.7 0-3.2.5-4.2 1.3-1 .7-1.4 1.6-1.4 2.3 0 .4.1.7.3 1 .2.3.5.6 1 1 1 .7 2.6 1.3 4.6 1.6h.1c1.9.4 3.6.9 5.1 1.6 1.5.7 2.9 1.7 3.7 3.1.6.9.9 2 .9 3.2 0 2.4-1.3 4.4-3.2 5.8-1.8 1.3-4.2 2.1-6.9 2.1-4 0-7.4-2-9.5-3.7-.7-.8-.8-2.1-.1-2.9Z"
          fill={`url(#${id}-b)`}
        />
        <path
          d="M42.9 103.998c-2.6 0-5.3-.6-7.4-1.8l-27.8-16.1c-4.2-2.4-7.4-8-7.4-12.8v-32.2c0-4.9 3.2-10.4 7.4-12.8l27.8-16.1c4.2-2.4 10.6-2.4 14.8 0l27.8 16.1c4.2 2.4 7.4 8 7.4 12.8v32.2c0 4.9-3.2 10.4-7.4 12.8l-27.8 16.1c-2.1 1.2-4.8 1.8-7.4 1.8Zm-30.3-67c-1.1.7-2.4 2.8-2.4 4.2v32.2c0 1.3 1.3 3.5 2.4 4.2l27.8 16.1c1.1.7 3.7.7 4.8 0l27.8-16.1c1.1-.7 2.4-2.8 2.4-4.2v-32.2c0-1.3-1.3-3.5-2.4-4.2l-27.8-16.1c-1.1-.7-3.7-.7-4.8 0l-27.8 16.1Z"
          fill="#D4EDFC"
        />
        <path
          d="M33.4 52.203c-3 3.6-4.4 6.4-4.4 6.4s12 36.4 48.4 35c-.1.1-33.4-7.2-44-41.4Z"
          fill={`url(#${id}-c)`}
        />
        <path
          d="M53.1 57.602c.4.1.8-.1.9-.5.1-.3-.2-.7-.6-.8l-19.9-4.8c-.4-.1-.8.1-.9.5-.1.3.2.7.6.8l19.9 4.8Z"
          fill={`url(#${id}-d)`}
        />
        <path
          d="M50.7 52.804c.4.1.8-.1.9-.5.1-.3-.2-.7-.6-.8l-14.4-3.4c-.4-.1-.8.1-.9.5-.1.3.2.7.6.8l14.4 3.4Z"
          fill={`url(#${id}-e)`}
        />
        <path
          d="M47.3 47.903c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-7.1-1.7c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l7.1 1.7Z"
          fill={`url(#${id}-f)`}
        />
        <path
          d="M55.9 65.3s-3.5-14.8-15.1-23.8C22.7 27.6 23.3 7.4 24.4.5c-.8 5.5 7.7 24.2 17.7 32.4 15.7 12.9 15.6 21.2 15.6 21.2l-1.8 11.2Z"
          fill={`url(#${id}-g)`}
        />
        <path
          d="M28.9 58.697s6.9-12.4 20.7-17.8c21.6-8.5 26.7-24.7 27.7-31.6-.8 5.5-14.2 18-27.3 23.6-18.1 7.8-19.4 14.7-19.4 14.7l-1.7 11.1Z"
          fill={`url(#${id}-h)`}
        />
        <path
          d="M42.1 20c-1.2 3.9.3 7.8 3.5 8.9 3.2 1.1 6.8-1.3 8-5.1 1.2-3.9-.3-7.8-3.5-8.9-3.2-1.1-6.8 1.3-8 5.1Z"
          fill={`url(#${id}-i)`}
        />
        <path
          d="M53.4 58.203c-4.4 1.2-46.4 14.1-21 55.7 0 0-18.5-35.7 23.5-48.7l-.1-.4c-.4-1.3-1.4-4.3-2.4-6.6Z"
          fill={`url(#${id}-j)`}
        />
        <path
          d="M43.4 67.7c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-9-2.2c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l9 2.2Z"
          fill={`url(#${id}-k)`}
        />
        <path
          d="M48.3 64.698c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-15.8-3.8c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l15.8 3.8Z"
          fill={`url(#${id}-l)`}
        />
        <path
          d="M52.4 61.796c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-20.2-5c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l20.2 5Z"
          fill={`url(#${id}-m)`}
        />
      </g>
      <defs>
        <linearGradient
          id={`${id}-b`}
          x1="100.587"
          y1="57.214"
          x2="440.745"
          y2="57.214"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#005CA9" />
          <stop offset="1" stopColor="#312783" />
        </linearGradient>
        <linearGradient
          id={`${id}-c`}
          x1="34.727"
          y1="62.234"
          x2="63.292"
          y2="90.199"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#312783" />
          <stop offset=".2" stopColor="#005CA9" />
          <stop offset=".8" stopColor="#005CA9" />
          <stop offset="1" stopColor="#312783" />
        </linearGradient>
        <linearGradient
          id={`${id}-d`}
          x1="32.601"
          y1="52.005"
          x2="54.046"
          y2="57.073"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#005CA9" />
          <stop offset="1" stopColor="#312783" />
        </linearGradient>
        <linearGradient
          id={`${id}-e`}
          x1="35.801"
          y1="48.61"
          x2="51.609"
          y2="52.346"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#005CA9" />
          <stop offset="1" stopColor="#312783" />
        </linearGradient>
        <linearGradient
          id={`${id}-f`}
          x1="39.526"
          y1="45.463"
          x2="48.203"
          y2="47.514"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#005CA9" />
          <stop offset="1" stopColor="#312783" />
        </linearGradient>
        <linearGradient
          id={`${id}-g`}
          x1="23.877"
          y1="32.888"
          x2="57.567"
          y2="32.888"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".001" stopColor="#F9B233" />
          <stop offset="1" stopColor="#FFDD00" />
        </linearGradient>
        <linearGradient
          id={`${id}-h`}
          x1="34.941"
          y1="45.723"
          x2="68.246"
          y2="24.232"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#005CA9" />
          <stop offset="1" stopColor="#312783" />
        </linearGradient>
        <linearGradient
          id={`${id}-i`}
          x1="45.747"
          y1="28.486"
          x2="49.185"
          y2="17.6"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#005CA9" />
          <stop offset="1" stopColor="#312783" />
        </linearGradient>
        <linearGradient
          id={`${id}-j`}
          x1="59.785"
          y1="64.628"
          x2="21.42"
          y2="102.993"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F9B233" />
          <stop offset=".8" stopColor="#FFDD00" />
          <stop offset="1" stopColor="#F9B233" />
        </linearGradient>
        <linearGradient
          id={`${id}-k`}
          x1="33.724"
          y1="64.761"
          x2="44.311"
          y2="67.264"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#005BA8" />
          <stop offset="1" stopColor="#312783" />
        </linearGradient>
        <linearGradient
          id={`${id}-l`}
          x1="31.822"
          y1="60.177"
          x2="49.253"
          y2="64.296"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#005CA9" />
          <stop offset="1" stopColor="#312783" />
        </linearGradient>
        <linearGradient
          id={`${id}-m`}
          x1="31.53"
          y1="56.154"
          x2="53.324"
          y2="61.305"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#005CA9" />
          <stop offset="1" stopColor="#312783" />
        </linearGradient>
        <clipPath id={`${id}-a`}>
          <path fill="#FFFFFF" d="M0 0h441v114H0z" />
        </clipPath>
      </defs>
    </g>
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g fill="none">
    <defs>
      <clipPath id={`${id}-brand-symbol-bounds`}>
        <rect x="0.0" y="0.56685" width="88.2" height="113.43315" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-brand-symbol-bounds)`}>
      <g clipPath={`url(#${id}-a)`}>
        <path
          d="M100.6 46.597c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm26.3 22c0 1.1-.9 2-2 2-1.2 0-2-.9-2-2v-21.6c0-.6.3-1.3.8-1.7.9-.6 2.2-.4 2.8.4l12 16.6v-15.3c0-1.1.9-2 2-2s2 .9 2 2v21.6c0 1.1-.9 2-2 2-.6 0-1.2-.3-1.5-.7l-.2-.2-11.9-16.5v15.4Zm35.7 0v-21.9c0-1.1.9-2 2-2h12.1c1.1 0 2 .9 2 2 0 1.2-1 2.1-2 2.1h-10.1v6.8h8.7c1.1 0 2 1 2 2 0 1.2-.9 2.1-2 2.1h-8.7v8.9c0 1.1-.9 2-2.1 2-1 0-1.9-.9-1.9-2Zm33.9-22c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm26.3 22c0 1.1-.9 2-2 2-1.2 0-2-.9-2-2v-21.6c0-.6.3-1.3.8-1.7.9-.6 2.2-.4 2.8.4l12 16.6v-15.3c0-1.1.9-2 2-2s2 .9 2 2v21.6c0 1.1-.9 2-2 2-.6 0-1.2-.3-1.5-.7l-.2-.2-11.9-16.5v15.4Zm34.7-22c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm38.1 2.1h-5.9v19.8c0 1.2-.9 2-2 2s-2-.9-2-2v-19.8h-5.9c-1.2 0-2-1-2-2.1 0-1.2.9-2 2-2h15.9c1.1 0 2 .9 2 2s-.9 2.1-2.1 2.1Zm37.8-.9c2.3 2.5 3.8 5.7 3.8 9.4s-1.4 7-3.8 9.4c-2.2 2.4-5.5 4-8.9 4-3.6 0-6.8-1.6-9.1-4s-3.7-5.7-3.7-9.4 1.4-7 3.7-9.4c2.3-2.5 5.5-4 9.1-4 3.5 0 6.7 1.6 8.9 4Zm-.4 9.4c0-2.5-1-4.9-2.5-6.5-1.6-1.7-3.6-2.6-5.9-2.6-2.4 0-4.5 1-6 2.6-1.6 1.6-2.5 4-2.5 6.5s1 4.9 2.5 6.5c1.6 1.7 3.6 2.7 6 2.7 2.2 0 4.3-1 5.9-2.7 1.5-1.6 2.5-4 2.5-6.5Zm31.4 3.3h-4.6v8.1c0 1.1-.9 2-2.1 2-1.1 0-2-.9-2-2v-21.9c0-1.2.9-2 2-2h6.6c4.4 0 8 3.6 8 8 .1 4.2-3.5 7.8-7.9 7.8Zm-4.6-4.1h4.6c2.2 0 3.8-1.7 3.9-3.8 0-2.2-1.7-3.9-3.9-3.9h-4.6v7.7Zm28.7 12.2v-21.9c0-1.2.9-2 2-2h12.1c1.1 0 2 .9 2 2 0 1.2-1 2.1-2 2.1h-10.1v6.8h8.7c1.1 0 2 1 2 2 0 1.2-.9 2.1-2 2.1h-8.7v6.8h10.1c1.1 0 2 .9 2 2.1 0 1.1-1 2-2 2h-12.1c-1.1 0-2-.9-2-2Zm32.4-4.5c.7-.8 1.9-.9 2.7-.3 1.6 1.3 4.5 2.9 7.1 2.9 1.9 0 3.5-.6 4.6-1.4 1.1-.8 1.6-1.7 1.6-2.7 0-.5-.1-.8-.3-1.2-.2-.4-.6-.7-1.1-1.1-1.1-.7-2.9-1.3-5.1-1.7h-.1c-1.7-.3-3.4-.8-4.8-1.4-1.4-.7-2.6-1.6-3.5-2.9-.6-.9-.9-1.9-.9-3 0-2.2 1.3-4.2 3-5.4 1.7-1.3 4-2 6.4-2 3.6 0 6.2 1.7 8.1 3 .9.6 1.1 1.8.5 2.6-.6.9-1.7 1.2-2.6.6-1.9-1.3-3.7-2.4-6-2.4-1.7 0-3.2.5-4.2 1.3-1 .7-1.4 1.6-1.4 2.3 0 .4.1.7.3 1 .2.3.5.6 1 1 1 .7 2.6 1.3 4.6 1.6h.1c1.9.4 3.6.9 5.1 1.6 1.5.7 2.9 1.7 3.7 3.1.6.9.9 2 .9 3.2 0 2.4-1.3 4.4-3.2 5.8-1.8 1.3-4.2 2.1-6.9 2.1-4 0-7.4-2-9.5-3.7-.7-.8-.8-2.1-.1-2.9Z"
          fill={`url(#${id}-b)`}
        />
        <path
          d="M42.9 103.998c-2.6 0-5.3-.6-7.4-1.8l-27.8-16.1c-4.2-2.4-7.4-8-7.4-12.8v-32.2c0-4.9 3.2-10.4 7.4-12.8l27.8-16.1c4.2-2.4 10.6-2.4 14.8 0l27.8 16.1c4.2 2.4 7.4 8 7.4 12.8v32.2c0 4.9-3.2 10.4-7.4 12.8l-27.8 16.1c-2.1 1.2-4.8 1.8-7.4 1.8Zm-30.3-67c-1.1.7-2.4 2.8-2.4 4.2v32.2c0 1.3 1.3 3.5 2.4 4.2l27.8 16.1c1.1.7 3.7.7 4.8 0l27.8-16.1c1.1-.7 2.4-2.8 2.4-4.2v-32.2c0-1.3-1.3-3.5-2.4-4.2l-27.8-16.1c-1.1-.7-3.7-.7-4.8 0l-27.8 16.1Z"
          fill="#D4EDFC"
        />
        <path
          d="M33.4 52.203c-3 3.6-4.4 6.4-4.4 6.4s12 36.4 48.4 35c-.1.1-33.4-7.2-44-41.4Z"
          fill={`url(#${id}-c)`}
        />
        <path
          d="M53.1 57.602c.4.1.8-.1.9-.5.1-.3-.2-.7-.6-.8l-19.9-4.8c-.4-.1-.8.1-.9.5-.1.3.2.7.6.8l19.9 4.8Z"
          fill={`url(#${id}-d)`}
        />
        <path
          d="M50.7 52.804c.4.1.8-.1.9-.5.1-.3-.2-.7-.6-.8l-14.4-3.4c-.4-.1-.8.1-.9.5-.1.3.2.7.6.8l14.4 3.4Z"
          fill={`url(#${id}-e)`}
        />
        <path
          d="M47.3 47.903c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-7.1-1.7c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l7.1 1.7Z"
          fill={`url(#${id}-f)`}
        />
        <path
          d="M55.9 65.3s-3.5-14.8-15.1-23.8C22.7 27.6 23.3 7.4 24.4.5c-.8 5.5 7.7 24.2 17.7 32.4 15.7 12.9 15.6 21.2 15.6 21.2l-1.8 11.2Z"
          fill={`url(#${id}-g)`}
        />
        <path
          d="M28.9 58.697s6.9-12.4 20.7-17.8c21.6-8.5 26.7-24.7 27.7-31.6-.8 5.5-14.2 18-27.3 23.6-18.1 7.8-19.4 14.7-19.4 14.7l-1.7 11.1Z"
          fill={`url(#${id}-h)`}
        />
        <path
          d="M42.1 20c-1.2 3.9.3 7.8 3.5 8.9 3.2 1.1 6.8-1.3 8-5.1 1.2-3.9-.3-7.8-3.5-8.9-3.2-1.1-6.8 1.3-8 5.1Z"
          fill={`url(#${id}-i)`}
        />
        <path
          d="M53.4 58.203c-4.4 1.2-46.4 14.1-21 55.7 0 0-18.5-35.7 23.5-48.7l-.1-.4c-.4-1.3-1.4-4.3-2.4-6.6Z"
          fill={`url(#${id}-j)`}
        />
        <path
          d="M43.4 67.7c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-9-2.2c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l9 2.2Z"
          fill={`url(#${id}-k)`}
        />
        <path
          d="M48.3 64.698c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-15.8-3.8c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l15.8 3.8Z"
          fill={`url(#${id}-l)`}
        />
        <path
          d="M52.4 61.796c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-20.2-5c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l20.2 5Z"
          fill={`url(#${id}-m)`}
        />
      </g>
      <defs>
        <linearGradient
          id={`${id}-b`}
          x1="100.587"
          y1="57.214"
          x2="440.745"
          y2="57.214"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3880BC" />
          <stop offset="1" stopColor="#7B75B0" />
        </linearGradient>
        <linearGradient
          id={`${id}-c`}
          x1="34.727"
          y1="62.234"
          x2="63.292"
          y2="90.199"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7B75B0" />
          <stop offset=".2" stopColor="#3880BC" />
          <stop offset=".8" stopColor="#3880BC" />
          <stop offset="1" stopColor="#7B75B0" />
        </linearGradient>
        <linearGradient
          id={`${id}-d`}
          x1="32.601"
          y1="52.005"
          x2="54.046"
          y2="57.073"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3880BC" />
          <stop offset="1" stopColor="#7B75B0" />
        </linearGradient>
        <linearGradient
          id={`${id}-e`}
          x1="35.801"
          y1="48.61"
          x2="51.609"
          y2="52.346"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3880BC" />
          <stop offset="1" stopColor="#7B75B0" />
        </linearGradient>
        <linearGradient
          id={`${id}-f`}
          x1="39.526"
          y1="45.463"
          x2="48.203"
          y2="47.514"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3880BC" />
          <stop offset="1" stopColor="#7B75B0" />
        </linearGradient>
        <linearGradient
          id={`${id}-g`}
          x1="23.877"
          y1="32.888"
          x2="57.567"
          y2="32.888"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".001" stopColor="#F9B233" />
          <stop offset="1" stopColor="#FFDD00" />
        </linearGradient>
        <linearGradient
          id={`${id}-h`}
          x1="34.941"
          y1="45.723"
          x2="68.246"
          y2="24.232"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3880BC" />
          <stop offset="1" stopColor="#7B75B0" />
        </linearGradient>
        <linearGradient
          id={`${id}-i`}
          x1="45.747"
          y1="28.486"
          x2="49.185"
          y2="17.6"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3880BC" />
          <stop offset="1" stopColor="#7B75B0" />
        </linearGradient>
        <linearGradient
          id={`${id}-j`}
          x1="59.785"
          y1="64.628"
          x2="21.42"
          y2="102.993"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F9B233" />
          <stop offset=".8" stopColor="#FFDD00" />
          <stop offset="1" stopColor="#F9B233" />
        </linearGradient>
        <linearGradient
          id={`${id}-k`}
          x1="33.724"
          y1="64.761"
          x2="44.311"
          y2="67.264"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3980BC" />
          <stop offset="1" stopColor="#7B75B0" />
        </linearGradient>
        <linearGradient
          id={`${id}-l`}
          x1="31.822"
          y1="60.177"
          x2="49.253"
          y2="64.296"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3880BC" />
          <stop offset="1" stopColor="#7B75B0" />
        </linearGradient>
        <linearGradient
          id={`${id}-m`}
          x1="31.53"
          y1="56.154"
          x2="53.324"
          y2="61.305"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3880BC" />
          <stop offset="1" stopColor="#7B75B0" />
        </linearGradient>
        <clipPath id={`${id}-a`}>
          <path fill="#FFFFFF" d="M0 0h441v114H0z" />
        </clipPath>
      </defs>
    </g>
  </g>
);
export const logoLight = ({ id }: { id: string }) => (
  <svg fill="none" viewBox="0 0.56685 441 113.43315">
    <g clipPath={`url(#${id}-a)`}>
      <path
        d="M100.6 46.597c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm26.3 22c0 1.1-.9 2-2 2-1.2 0-2-.9-2-2v-21.6c0-.6.3-1.3.8-1.7.9-.6 2.2-.4 2.8.4l12 16.6v-15.3c0-1.1.9-2 2-2s2 .9 2 2v21.6c0 1.1-.9 2-2 2-.6 0-1.2-.3-1.5-.7l-.2-.2-11.9-16.5v15.4Zm35.7 0v-21.9c0-1.1.9-2 2-2h12.1c1.1 0 2 .9 2 2 0 1.2-1 2.1-2 2.1h-10.1v6.8h8.7c1.1 0 2 1 2 2 0 1.2-.9 2.1-2 2.1h-8.7v8.9c0 1.1-.9 2-2.1 2-1 0-1.9-.9-1.9-2Zm33.9-22c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm26.3 22c0 1.1-.9 2-2 2-1.2 0-2-.9-2-2v-21.6c0-.6.3-1.3.8-1.7.9-.6 2.2-.4 2.8.4l12 16.6v-15.3c0-1.1.9-2 2-2s2 .9 2 2v21.6c0 1.1-.9 2-2 2-.6 0-1.2-.3-1.5-.7l-.2-.2-11.9-16.5v15.4Zm34.7-22c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm38.1 2.1h-5.9v19.8c0 1.2-.9 2-2 2s-2-.9-2-2v-19.8h-5.9c-1.2 0-2-1-2-2.1 0-1.2.9-2 2-2h15.9c1.1 0 2 .9 2 2s-.9 2.1-2.1 2.1Zm37.8-.9c2.3 2.5 3.8 5.7 3.8 9.4s-1.4 7-3.8 9.4c-2.2 2.4-5.5 4-8.9 4-3.6 0-6.8-1.6-9.1-4s-3.7-5.7-3.7-9.4 1.4-7 3.7-9.4c2.3-2.5 5.5-4 9.1-4 3.5 0 6.7 1.6 8.9 4Zm-.4 9.4c0-2.5-1-4.9-2.5-6.5-1.6-1.7-3.6-2.6-5.9-2.6-2.4 0-4.5 1-6 2.6-1.6 1.6-2.5 4-2.5 6.5s1 4.9 2.5 6.5c1.6 1.7 3.6 2.7 6 2.7 2.2 0 4.3-1 5.9-2.7 1.5-1.6 2.5-4 2.5-6.5Zm31.4 3.3h-4.6v8.1c0 1.1-.9 2-2.1 2-1.1 0-2-.9-2-2v-21.9c0-1.2.9-2 2-2h6.6c4.4 0 8 3.6 8 8 .1 4.2-3.5 7.8-7.9 7.8Zm-4.6-4.1h4.6c2.2 0 3.8-1.7 3.9-3.8 0-2.2-1.7-3.9-3.9-3.9h-4.6v7.7Zm28.7 12.2v-21.9c0-1.2.9-2 2-2h12.1c1.1 0 2 .9 2 2 0 1.2-1 2.1-2 2.1h-10.1v6.8h8.7c1.1 0 2 1 2 2 0 1.2-.9 2.1-2 2.1h-8.7v6.8h10.1c1.1 0 2 .9 2 2.1 0 1.1-1 2-2 2h-12.1c-1.1 0-2-.9-2-2Zm32.4-4.5c.7-.8 1.9-.9 2.7-.3 1.6 1.3 4.5 2.9 7.1 2.9 1.9 0 3.5-.6 4.6-1.4 1.1-.8 1.6-1.7 1.6-2.7 0-.5-.1-.8-.3-1.2-.2-.4-.6-.7-1.1-1.1-1.1-.7-2.9-1.3-5.1-1.7h-.1c-1.7-.3-3.4-.8-4.8-1.4-1.4-.7-2.6-1.6-3.5-2.9-.6-.9-.9-1.9-.9-3 0-2.2 1.3-4.2 3-5.4 1.7-1.3 4-2 6.4-2 3.6 0 6.2 1.7 8.1 3 .9.6 1.1 1.8.5 2.6-.6.9-1.7 1.2-2.6.6-1.9-1.3-3.7-2.4-6-2.4-1.7 0-3.2.5-4.2 1.3-1 .7-1.4 1.6-1.4 2.3 0 .4.1.7.3 1 .2.3.5.6 1 1 1 .7 2.6 1.3 4.6 1.6h.1c1.9.4 3.6.9 5.1 1.6 1.5.7 2.9 1.7 3.7 3.1.6.9.9 2 .9 3.2 0 2.4-1.3 4.4-3.2 5.8-1.8 1.3-4.2 2.1-6.9 2.1-4 0-7.4-2-9.5-3.7-.7-.8-.8-2.1-.1-2.9Z"
        fill={`url(#${id}-b)`}
      />
      <path
        d="M42.9 103.998c-2.6 0-5.3-.6-7.4-1.8l-27.8-16.1c-4.2-2.4-7.4-8-7.4-12.8v-32.2c0-4.9 3.2-10.4 7.4-12.8l27.8-16.1c4.2-2.4 10.6-2.4 14.8 0l27.8 16.1c4.2 2.4 7.4 8 7.4 12.8v32.2c0 4.9-3.2 10.4-7.4 12.8l-27.8 16.1c-2.1 1.2-4.8 1.8-7.4 1.8Zm-30.3-67c-1.1.7-2.4 2.8-2.4 4.2v32.2c0 1.3 1.3 3.5 2.4 4.2l27.8 16.1c1.1.7 3.7.7 4.8 0l27.8-16.1c1.1-.7 2.4-2.8 2.4-4.2v-32.2c0-1.3-1.3-3.5-2.4-4.2l-27.8-16.1c-1.1-.7-3.7-.7-4.8 0l-27.8 16.1Z"
        fill="#D4EDFC"
      />
      <path
        d="M33.4 52.203c-3 3.6-4.4 6.4-4.4 6.4s12 36.4 48.4 35c-.1.1-33.4-7.2-44-41.4Z"
        fill={`url(#${id}-c)`}
      />
      <path
        d="M53.1 57.602c.4.1.8-.1.9-.5.1-.3-.2-.7-.6-.8l-19.9-4.8c-.4-.1-.8.1-.9.5-.1.3.2.7.6.8l19.9 4.8Z"
        fill={`url(#${id}-d)`}
      />
      <path
        d="M50.7 52.804c.4.1.8-.1.9-.5.1-.3-.2-.7-.6-.8l-14.4-3.4c-.4-.1-.8.1-.9.5-.1.3.2.7.6.8l14.4 3.4Z"
        fill={`url(#${id}-e)`}
      />
      <path
        d="M47.3 47.903c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-7.1-1.7c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l7.1 1.7Z"
        fill={`url(#${id}-f)`}
      />
      <path
        d="M55.9 65.3s-3.5-14.8-15.1-23.8C22.7 27.6 23.3 7.4 24.4.5c-.8 5.5 7.7 24.2 17.7 32.4 15.7 12.9 15.6 21.2 15.6 21.2l-1.8 11.2Z"
        fill={`url(#${id}-g)`}
      />
      <path
        d="M28.9 58.697s6.9-12.4 20.7-17.8c21.6-8.5 26.7-24.7 27.7-31.6-.8 5.5-14.2 18-27.3 23.6-18.1 7.8-19.4 14.7-19.4 14.7l-1.7 11.1Z"
        fill={`url(#${id}-h)`}
      />
      <path
        d="M42.1 20c-1.2 3.9.3 7.8 3.5 8.9 3.2 1.1 6.8-1.3 8-5.1 1.2-3.9-.3-7.8-3.5-8.9-3.2-1.1-6.8 1.3-8 5.1Z"
        fill={`url(#${id}-i)`}
      />
      <path
        d="M53.4 58.203c-4.4 1.2-46.4 14.1-21 55.7 0 0-18.5-35.7 23.5-48.7l-.1-.4c-.4-1.3-1.4-4.3-2.4-6.6Z"
        fill={`url(#${id}-j)`}
      />
      <path
        d="M43.4 67.7c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-9-2.2c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l9 2.2Z"
        fill={`url(#${id}-k)`}
      />
      <path
        d="M48.3 64.698c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-15.8-3.8c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l15.8 3.8Z"
        fill={`url(#${id}-l)`}
      />
      <path
        d="M52.4 61.796c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-20.2-5c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l20.2 5Z"
        fill={`url(#${id}-m)`}
      />
    </g>
    <defs>
      <linearGradient
        id={`${id}-b`}
        x1="100.587"
        y1="57.214"
        x2="440.745"
        y2="57.214"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#005CA9" />
        <stop offset="1" stopColor="#312783" />
      </linearGradient>
      <linearGradient
        id={`${id}-c`}
        x1="34.727"
        y1="62.234"
        x2="63.292"
        y2="90.199"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#312783" />
        <stop offset=".2" stopColor="#005CA9" />
        <stop offset=".8" stopColor="#005CA9" />
        <stop offset="1" stopColor="#312783" />
      </linearGradient>
      <linearGradient
        id={`${id}-d`}
        x1="32.601"
        y1="52.005"
        x2="54.046"
        y2="57.073"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#005CA9" />
        <stop offset="1" stopColor="#312783" />
      </linearGradient>
      <linearGradient
        id={`${id}-e`}
        x1="35.801"
        y1="48.61"
        x2="51.609"
        y2="52.346"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#005CA9" />
        <stop offset="1" stopColor="#312783" />
      </linearGradient>
      <linearGradient
        id={`${id}-f`}
        x1="39.526"
        y1="45.463"
        x2="48.203"
        y2="47.514"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#005CA9" />
        <stop offset="1" stopColor="#312783" />
      </linearGradient>
      <linearGradient
        id={`${id}-g`}
        x1="23.877"
        y1="32.888"
        x2="57.567"
        y2="32.888"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset=".001" stopColor="#F9B233" />
        <stop offset="1" stopColor="#FFDD00" />
      </linearGradient>
      <linearGradient
        id={`${id}-h`}
        x1="34.941"
        y1="45.723"
        x2="68.246"
        y2="24.232"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#005CA9" />
        <stop offset="1" stopColor="#312783" />
      </linearGradient>
      <linearGradient
        id={`${id}-i`}
        x1="45.747"
        y1="28.486"
        x2="49.185"
        y2="17.6"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#005CA9" />
        <stop offset="1" stopColor="#312783" />
      </linearGradient>
      <linearGradient
        id={`${id}-j`}
        x1="59.785"
        y1="64.628"
        x2="21.42"
        y2="102.993"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#F9B233" />
        <stop offset=".8" stopColor="#FFDD00" />
        <stop offset="1" stopColor="#F9B233" />
      </linearGradient>
      <linearGradient
        id={`${id}-k`}
        x1="33.724"
        y1="64.761"
        x2="44.311"
        y2="67.264"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#005BA8" />
        <stop offset="1" stopColor="#312783" />
      </linearGradient>
      <linearGradient
        id={`${id}-l`}
        x1="31.822"
        y1="60.177"
        x2="49.253"
        y2="64.296"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#005CA9" />
        <stop offset="1" stopColor="#312783" />
      </linearGradient>
      <linearGradient
        id={`${id}-m`}
        x1="31.53"
        y1="56.154"
        x2="53.324"
        y2="61.305"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#005CA9" />
        <stop offset="1" stopColor="#312783" />
      </linearGradient>
      <clipPath id={`${id}-a`}>
        <path fill="#FFFFFF" d="M0 0h441v114H0z" />
      </clipPath>
    </defs>
  </svg>
);
export const logoDark = ({ id }: { id: string }) => (
  <svg fill="none" viewBox="0 0.56685 441 113.43315">
    <g clipPath={`url(#${id}-a)`}>
      <path
        d="M100.6 46.597c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm26.3 22c0 1.1-.9 2-2 2-1.2 0-2-.9-2-2v-21.6c0-.6.3-1.3.8-1.7.9-.6 2.2-.4 2.8.4l12 16.6v-15.3c0-1.1.9-2 2-2s2 .9 2 2v21.6c0 1.1-.9 2-2 2-.6 0-1.2-.3-1.5-.7l-.2-.2-11.9-16.5v15.4Zm35.7 0v-21.9c0-1.1.9-2 2-2h12.1c1.1 0 2 .9 2 2 0 1.2-1 2.1-2 2.1h-10.1v6.8h8.7c1.1 0 2 1 2 2 0 1.2-.9 2.1-2 2.1h-8.7v8.9c0 1.1-.9 2-2.1 2-1 0-1.9-.9-1.9-2Zm33.9-22c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm26.3 22c0 1.1-.9 2-2 2-1.2 0-2-.9-2-2v-21.6c0-.6.3-1.3.8-1.7.9-.6 2.2-.4 2.8.4l12 16.6v-15.3c0-1.1.9-2 2-2s2 .9 2 2v21.6c0 1.1-.9 2-2 2-.6 0-1.2-.3-1.5-.7l-.2-.2-11.9-16.5v15.4Zm34.7-22c0-1.2.9-2 2-2s2.1.9 2.1 2v21.9c0 1.2-1 2-2.1 2-1.2 0-2-.9-2-2v-21.9Zm38.1 2.1h-5.9v19.8c0 1.2-.9 2-2 2s-2-.9-2-2v-19.8h-5.9c-1.2 0-2-1-2-2.1 0-1.2.9-2 2-2h15.9c1.1 0 2 .9 2 2s-.9 2.1-2.1 2.1Zm37.8-.9c2.3 2.5 3.8 5.7 3.8 9.4s-1.4 7-3.8 9.4c-2.2 2.4-5.5 4-8.9 4-3.6 0-6.8-1.6-9.1-4s-3.7-5.7-3.7-9.4 1.4-7 3.7-9.4c2.3-2.5 5.5-4 9.1-4 3.5 0 6.7 1.6 8.9 4Zm-.4 9.4c0-2.5-1-4.9-2.5-6.5-1.6-1.7-3.6-2.6-5.9-2.6-2.4 0-4.5 1-6 2.6-1.6 1.6-2.5 4-2.5 6.5s1 4.9 2.5 6.5c1.6 1.7 3.6 2.7 6 2.7 2.2 0 4.3-1 5.9-2.7 1.5-1.6 2.5-4 2.5-6.5Zm31.4 3.3h-4.6v8.1c0 1.1-.9 2-2.1 2-1.1 0-2-.9-2-2v-21.9c0-1.2.9-2 2-2h6.6c4.4 0 8 3.6 8 8 .1 4.2-3.5 7.8-7.9 7.8Zm-4.6-4.1h4.6c2.2 0 3.8-1.7 3.9-3.8 0-2.2-1.7-3.9-3.9-3.9h-4.6v7.7Zm28.7 12.2v-21.9c0-1.2.9-2 2-2h12.1c1.1 0 2 .9 2 2 0 1.2-1 2.1-2 2.1h-10.1v6.8h8.7c1.1 0 2 1 2 2 0 1.2-.9 2.1-2 2.1h-8.7v6.8h10.1c1.1 0 2 .9 2 2.1 0 1.1-1 2-2 2h-12.1c-1.1 0-2-.9-2-2Zm32.4-4.5c.7-.8 1.9-.9 2.7-.3 1.6 1.3 4.5 2.9 7.1 2.9 1.9 0 3.5-.6 4.6-1.4 1.1-.8 1.6-1.7 1.6-2.7 0-.5-.1-.8-.3-1.2-.2-.4-.6-.7-1.1-1.1-1.1-.7-2.9-1.3-5.1-1.7h-.1c-1.7-.3-3.4-.8-4.8-1.4-1.4-.7-2.6-1.6-3.5-2.9-.6-.9-.9-1.9-.9-3 0-2.2 1.3-4.2 3-5.4 1.7-1.3 4-2 6.4-2 3.6 0 6.2 1.7 8.1 3 .9.6 1.1 1.8.5 2.6-.6.9-1.7 1.2-2.6.6-1.9-1.3-3.7-2.4-6-2.4-1.7 0-3.2.5-4.2 1.3-1 .7-1.4 1.6-1.4 2.3 0 .4.1.7.3 1 .2.3.5.6 1 1 1 .7 2.6 1.3 4.6 1.6h.1c1.9.4 3.6.9 5.1 1.6 1.5.7 2.9 1.7 3.7 3.1.6.9.9 2 .9 3.2 0 2.4-1.3 4.4-3.2 5.8-1.8 1.3-4.2 2.1-6.9 2.1-4 0-7.4-2-9.5-3.7-.7-.8-.8-2.1-.1-2.9Z"
        fill={`url(#${id}-b)`}
      />
      <path
        d="M42.9 103.998c-2.6 0-5.3-.6-7.4-1.8l-27.8-16.1c-4.2-2.4-7.4-8-7.4-12.8v-32.2c0-4.9 3.2-10.4 7.4-12.8l27.8-16.1c4.2-2.4 10.6-2.4 14.8 0l27.8 16.1c4.2 2.4 7.4 8 7.4 12.8v32.2c0 4.9-3.2 10.4-7.4 12.8l-27.8 16.1c-2.1 1.2-4.8 1.8-7.4 1.8Zm-30.3-67c-1.1.7-2.4 2.8-2.4 4.2v32.2c0 1.3 1.3 3.5 2.4 4.2l27.8 16.1c1.1.7 3.7.7 4.8 0l27.8-16.1c1.1-.7 2.4-2.8 2.4-4.2v-32.2c0-1.3-1.3-3.5-2.4-4.2l-27.8-16.1c-1.1-.7-3.7-.7-4.8 0l-27.8 16.1Z"
        fill="#D4EDFC"
      />
      <path
        d="M33.4 52.203c-3 3.6-4.4 6.4-4.4 6.4s12 36.4 48.4 35c-.1.1-33.4-7.2-44-41.4Z"
        fill={`url(#${id}-c)`}
      />
      <path
        d="M53.1 57.602c.4.1.8-.1.9-.5.1-.3-.2-.7-.6-.8l-19.9-4.8c-.4-.1-.8.1-.9.5-.1.3.2.7.6.8l19.9 4.8Z"
        fill={`url(#${id}-d)`}
      />
      <path
        d="M50.7 52.804c.4.1.8-.1.9-.5.1-.3-.2-.7-.6-.8l-14.4-3.4c-.4-.1-.8.1-.9.5-.1.3.2.7.6.8l14.4 3.4Z"
        fill={`url(#${id}-e)`}
      />
      <path
        d="M47.3 47.903c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-7.1-1.7c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l7.1 1.7Z"
        fill={`url(#${id}-f)`}
      />
      <path
        d="M55.9 65.3s-3.5-14.8-15.1-23.8C22.7 27.6 23.3 7.4 24.4.5c-.8 5.5 7.7 24.2 17.7 32.4 15.7 12.9 15.6 21.2 15.6 21.2l-1.8 11.2Z"
        fill={`url(#${id}-g)`}
      />
      <path
        d="M28.9 58.697s6.9-12.4 20.7-17.8c21.6-8.5 26.7-24.7 27.7-31.6-.8 5.5-14.2 18-27.3 23.6-18.1 7.8-19.4 14.7-19.4 14.7l-1.7 11.1Z"
        fill={`url(#${id}-h)`}
      />
      <path
        d="M42.1 20c-1.2 3.9.3 7.8 3.5 8.9 3.2 1.1 6.8-1.3 8-5.1 1.2-3.9-.3-7.8-3.5-8.9-3.2-1.1-6.8 1.3-8 5.1Z"
        fill={`url(#${id}-i)`}
      />
      <path
        d="M53.4 58.203c-4.4 1.2-46.4 14.1-21 55.7 0 0-18.5-35.7 23.5-48.7l-.1-.4c-.4-1.3-1.4-4.3-2.4-6.6Z"
        fill={`url(#${id}-j)`}
      />
      <path
        d="M43.4 67.7c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-9-2.2c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l9 2.2Z"
        fill={`url(#${id}-k)`}
      />
      <path
        d="M48.3 64.698c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-15.8-3.8c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l15.8 3.8Z"
        fill={`url(#${id}-l)`}
      />
      <path
        d="M52.4 61.796c.4.1.9-.1.9-.4.1-.3-.2-.7-.6-.8l-20.2-5c-.4-.1-.9.1-.9.4-.1.3.2.7.6.8l20.2 5Z"
        fill={`url(#${id}-m)`}
      />
    </g>
    <defs>
      <linearGradient
        id={`${id}-b`}
        x1="100.587"
        y1="57.214"
        x2="440.745"
        y2="57.214"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3880BC" />
        <stop offset="1" stopColor="#7B75B0" />
      </linearGradient>
      <linearGradient
        id={`${id}-c`}
        x1="34.727"
        y1="62.234"
        x2="63.292"
        y2="90.199"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#7B75B0" />
        <stop offset=".2" stopColor="#3880BC" />
        <stop offset=".8" stopColor="#3880BC" />
        <stop offset="1" stopColor="#7B75B0" />
      </linearGradient>
      <linearGradient
        id={`${id}-d`}
        x1="32.601"
        y1="52.005"
        x2="54.046"
        y2="57.073"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3880BC" />
        <stop offset="1" stopColor="#7B75B0" />
      </linearGradient>
      <linearGradient
        id={`${id}-e`}
        x1="35.801"
        y1="48.61"
        x2="51.609"
        y2="52.346"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3880BC" />
        <stop offset="1" stopColor="#7B75B0" />
      </linearGradient>
      <linearGradient
        id={`${id}-f`}
        x1="39.526"
        y1="45.463"
        x2="48.203"
        y2="47.514"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3880BC" />
        <stop offset="1" stopColor="#7B75B0" />
      </linearGradient>
      <linearGradient
        id={`${id}-g`}
        x1="23.877"
        y1="32.888"
        x2="57.567"
        y2="32.888"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset=".001" stopColor="#F9B233" />
        <stop offset="1" stopColor="#FFDD00" />
      </linearGradient>
      <linearGradient
        id={`${id}-h`}
        x1="34.941"
        y1="45.723"
        x2="68.246"
        y2="24.232"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3880BC" />
        <stop offset="1" stopColor="#7B75B0" />
      </linearGradient>
      <linearGradient
        id={`${id}-i`}
        x1="45.747"
        y1="28.486"
        x2="49.185"
        y2="17.6"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3880BC" />
        <stop offset="1" stopColor="#7B75B0" />
      </linearGradient>
      <linearGradient
        id={`${id}-j`}
        x1="59.785"
        y1="64.628"
        x2="21.42"
        y2="102.993"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#F9B233" />
        <stop offset=".8" stopColor="#FFDD00" />
        <stop offset="1" stopColor="#F9B233" />
      </linearGradient>
      <linearGradient
        id={`${id}-k`}
        x1="33.724"
        y1="64.761"
        x2="44.311"
        y2="67.264"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3980BC" />
        <stop offset="1" stopColor="#7B75B0" />
      </linearGradient>
      <linearGradient
        id={`${id}-l`}
        x1="31.822"
        y1="60.177"
        x2="49.253"
        y2="64.296"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3880BC" />
        <stop offset="1" stopColor="#7B75B0" />
      </linearGradient>
      <linearGradient
        id={`${id}-m`}
        x1="31.53"
        y1="56.154"
        x2="53.324"
        y2="61.305"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3880BC" />
        <stop offset="1" stopColor="#7B75B0" />
      </linearGradient>
      <clipPath id={`${id}-a`}>
        <path fill="#FFFFFF" d="M0 0h441v114H0z" />
      </clipPath>
    </defs>
  </svg>
);
const WordmarkLightSource = logoLight;
export const wordmarkLight = ({ id }: { id: string }) => (
  <svg viewBox="99.84975 43.04004 341.15025 28.11967" overflow="hidden">
    <defs>
      <clipPath id={`${id}-wordmark-crop`} clipPathUnits="userSpaceOnUse">
        <rect x="99.84975" y="43.04004" width="341.15025" height="28.11967" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-wordmark-crop)`}>
      <svg x="0" y="0.56685" width="441" height="113.43315">
        <WordmarkLightSource id={id} />
      </svg>
    </g>
  </svg>
);
const WordmarkDarkSource = logoDark;
export const wordmarkDark = ({ id }: { id: string }) => (
  <svg viewBox="99.84975 43.04004 341.15025 28.11967" overflow="hidden">
    <defs>
      <clipPath id={`${id}-wordmark-crop`} clipPathUnits="userSpaceOnUse">
        <rect x="99.84975" y="43.04004" width="341.15025" height="28.11967" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-wordmark-crop)`}>
      <svg x="0" y="0.56685" width="441" height="113.43315">
        <WordmarkDarkSource id={id} />
      </svg>
    </g>
  </svg>
);
