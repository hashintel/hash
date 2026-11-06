export const markLight = ({ id }: { id: string }) => (
  <g fill="#111111">
    <path
      d="M82.6 95.5c0 1.8-1.5 3.3-3.3 3.3H3.8C2 98.8.5 97.3.5 95.5V3.6C.5 1.8 2 .3 3.8.3h75.5c1.8 0 3.3 1.5 3.3 3.3v91.9z"
      fill="#ffc800"
    />
    <path
      d="M78.7 92.7c0 1.2-1 2.2-2.2 2.2H6.7c-1.2 0-2.2-1-2.2-2.2V6.4c0-1.2 1-2.2 2.2-2.2h69.7c1.2 0 2.2 1 2.2 2.2v86.3h.1z"
      fill="#ff7800"
    />
    <path
      d="M75.7 90.5c0 .9-.7 1.6-1.6 1.6H9c-.9 0-1.6-.7-1.6-1.6V8.7C7.4 7.8 8.1 7 9 7h65.1c.9 0 1.6.7 1.6 1.6v81.9z"
      fill="#d70000"
    />
    <path
      d="M73.4 88.6c0 .7-.6 1.2-1.2 1.2H11c-.7 0-1.2-.6-1.2-1.2V10.5c0-.7.6-1.2 1.2-1.2h61.2c.7 0 1.2.6 1.2 1.2v78.1z"
      fill="#00005f"
    />
    <path
      d="M26.7 76.8c-.2-.8-.5-2.2-.7-2.8h-5.4c-.2.6-.5 2-.7 2.8H15c2.1-6.5 3-9.3 5.3-15.1h6c2.3 5.8 3.3 8.6 5.3 15.1h-4.9zm-5.5-6.1h4.1c-.6-2-1.7-5.4-2-6.3-.5.9-1.5 4.3-2.1 6.3zm15.7 6.1c-2.5 0-3.9-1.4-3.9-4.1v-11h4.6v10.2c0 1.3.3 1.6 1.7 1.6h4.4l.7 3.4-7.5-.1zm25.9-15.1h4.6v15.1h-4.6zM46.2 76.8V61.7h6.3c4.6 0 7.9 1.9 7.9 7.4 0 5.4-2.6 7.7-7.7 7.7h-6.5zm4.6-3.3H52c2.8 0 3.9-1.3 3.9-4.4 0-3-1.4-4.2-4.1-4.2h-1.1l.1 8.6z"
      fill="#fff"
    />
    <linearGradient
      id={`${id}-a`}
      gradientUnits="userSpaceOnUse"
      x1="33.2"
      y1="46.8"
      x2="33.2"
      y2="84.6"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M39.8 17.4c-2.8 0-4 1.9-5 5.1l-9.7 28.4c-.8 2.4-1.9 3.9-3.6 4.1v.2h5c2.8 0 4-1.9 5-5.1l9.7-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-a)`}
    />
    <linearGradient
      id={`${id}-b`}
      gradientUnits="userSpaceOnUse"
      x1="42.35"
      y1="46.896"
      x2="42.35"
      y2="84.643"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M48.9 17.4c-2.8 0-4 1.9-5 5.1l-9.6 28.4c-.8 2.4-1.9 3.9-3.6 4.1v.2h5c2.8 0 4-1.9 5-5.1l9.6-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-b)`}
    />
    <linearGradient
      id={`${id}-c`}
      gradientUnits="userSpaceOnUse"
      x1="25.2"
      y1="46.7"
      x2="25.2"
      y2="84.5"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M30.7 17.5c-2.8 0-4 1.9-5 5.1L14.6 55.3h2.8c2.8 0 4-1.9 5-5.1l9.7-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-c)`}
    />
    <linearGradient
      id={`${id}-d`}
      gradientUnits="userSpaceOnUse"
      x1="48.704"
      y1="67.166"
      x2="59.718"
      y2="71.728"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset=".2" stopColor="#55c3f0" />
      <stop offset=".316" stopColor="#67caf2" />
      <stop offset=".549" stopColor="#97daf6" />
      <stop offset=".69" stopColor="#b7e5f9" />
      <stop offset=".727" stopColor="#aee0f5" />
      <stop offset=".786" stopColor="#95d1ea" />
      <stop offset=".862" stopColor="#6eb9d8" />
      <stop offset=".949" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M59.6 30.6c-1.1-2.1-2.2-2.4-4.2-2.4h-5l-2 5.9h9.9c1.4 0 2.6.2 3.4 1.2h.2c-.1 0-2.1-4.1-2.3-4.7z"
      fill={`url(#${id}-d)`}
    />
    <linearGradient
      id={`${id}-e`}
      gradientUnits="userSpaceOnUse"
      x1="46.339"
      y1="57.512"
      x2="62.776"
      y2="64.32"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset=".3" stopColor="#55c3f0" />
      <stop offset=".409" stopColor="#67caf2" />
      <stop offset=".628" stopColor="#97daf6" />
      <stop offset=".76" stopColor="#b7e5f9" />
      <stop offset=".788" stopColor="#aee0f5" />
      <stop offset=".835" stopColor="#95d1ea" />
      <stop offset=".893" stopColor="#6eb9d8" />
      <stop offset=".961" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M63.2 39.1c-1-2.1-2.2-2.4-4.2-2.4H47.5l-2 5.9h16.3c1.5 0 2.5.2 3.4 1.3h.2c-.1-.1-2-4.3-2.2-4.8z"
      fill={`url(#${id}-e)`}
    />
    <linearGradient
      id={`${id}-f`}
      gradientUnits="userSpaceOnUse"
      x1="43.845"
      y1="47.995"
      x2="65.663"
      y2="57.032"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#73cdf3" />
      <stop offset=".115" stopColor="#62c8f1" />
      <stop offset=".242" stopColor="#58c4f0" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".497" stopColor="#67caf2" />
      <stop offset=".692" stopColor="#97daf6" />
      <stop offset=".81" stopColor="#b7e5f9" />
      <stop offset=".832" stopColor="#aee0f5" />
      <stop offset=".869" stopColor="#95d1ea" />
      <stop offset=".915" stopColor="#6eb9d8" />
      <stop offset=".969" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M66.9 47.8c-1-2.3-2.3-2.7-4.3-2.7h-18L43 50c-.1.4-.2.7-.4 1h22.7c1.3 0 2.4.2 3.2 1.3h.2c0 .1-1.7-4.2-1.8-4.5z"
      fill={`url(#${id}-f)`}
    />
  </g>
);
export const markDark = ({ id }: { id: string }) => (
  <g fill="#F5F7FA">
    <path
      d="M82.6 95.5c0 1.8-1.5 3.3-3.3 3.3H3.8C2 98.8.5 97.3.5 95.5V3.6C.5 1.8 2 .3 3.8.3h75.5c1.8 0 3.3 1.5 3.3 3.3v91.9z"
      fill="#ffc800"
    />
    <path
      d="M78.7 92.7c0 1.2-1 2.2-2.2 2.2H6.7c-1.2 0-2.2-1-2.2-2.2V6.4c0-1.2 1-2.2 2.2-2.2h69.7c1.2 0 2.2 1 2.2 2.2v86.3h.1z"
      fill="#ff7800"
    />
    <path
      d="M75.7 90.5c0 .9-.7 1.6-1.6 1.6H9c-.9 0-1.6-.7-1.6-1.6V8.7C7.4 7.8 8.1 7 9 7h65.1c.9 0 1.6.7 1.6 1.6v81.9z"
      fill="#d70000"
    />
    <path
      d="M73.4 88.6c0 .7-.6 1.2-1.2 1.2H11c-.7 0-1.2-.6-1.2-1.2V10.5c0-.7.6-1.2 1.2-1.2h61.2c.7 0 1.2.6 1.2 1.2v78.1z"
      fill="#00005f"
    />
    <path
      d="M26.7 76.8c-.2-.8-.5-2.2-.7-2.8h-5.4c-.2.6-.5 2-.7 2.8H15c2.1-6.5 3-9.3 5.3-15.1h6c2.3 5.8 3.3 8.6 5.3 15.1h-4.9zm-5.5-6.1h4.1c-.6-2-1.7-5.4-2-6.3-.5.9-1.5 4.3-2.1 6.3zm15.7 6.1c-2.5 0-3.9-1.4-3.9-4.1v-11h4.6v10.2c0 1.3.3 1.6 1.7 1.6h4.4l.7 3.4-7.5-.1zm25.9-15.1h4.6v15.1h-4.6zM46.2 76.8V61.7h6.3c4.6 0 7.9 1.9 7.9 7.4 0 5.4-2.6 7.7-7.7 7.7h-6.5zm4.6-3.3H52c2.8 0 3.9-1.3 3.9-4.4 0-3-1.4-4.2-4.1-4.2h-1.1l.1 8.6z"
      fill="#fff"
    />
    <linearGradient
      id={`${id}-a`}
      gradientUnits="userSpaceOnUse"
      x1="33.2"
      y1="46.8"
      x2="33.2"
      y2="84.6"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M39.8 17.4c-2.8 0-4 1.9-5 5.1l-9.7 28.4c-.8 2.4-1.9 3.9-3.6 4.1v.2h5c2.8 0 4-1.9 5-5.1l9.7-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-a)`}
    />
    <linearGradient
      id={`${id}-b`}
      gradientUnits="userSpaceOnUse"
      x1="42.35"
      y1="46.896"
      x2="42.35"
      y2="84.643"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M48.9 17.4c-2.8 0-4 1.9-5 5.1l-9.6 28.4c-.8 2.4-1.9 3.9-3.6 4.1v.2h5c2.8 0 4-1.9 5-5.1l9.6-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-b)`}
    />
    <linearGradient
      id={`${id}-c`}
      gradientUnits="userSpaceOnUse"
      x1="25.2"
      y1="46.7"
      x2="25.2"
      y2="84.5"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M30.7 17.5c-2.8 0-4 1.9-5 5.1L14.6 55.3h2.8c2.8 0 4-1.9 5-5.1l9.7-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-c)`}
    />
    <linearGradient
      id={`${id}-d`}
      gradientUnits="userSpaceOnUse"
      x1="48.704"
      y1="67.166"
      x2="59.718"
      y2="71.728"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset=".2" stopColor="#55c3f0" />
      <stop offset=".316" stopColor="#67caf2" />
      <stop offset=".549" stopColor="#97daf6" />
      <stop offset=".69" stopColor="#b7e5f9" />
      <stop offset=".727" stopColor="#aee0f5" />
      <stop offset=".786" stopColor="#95d1ea" />
      <stop offset=".862" stopColor="#6eb9d8" />
      <stop offset=".949" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M59.6 30.6c-1.1-2.1-2.2-2.4-4.2-2.4h-5l-2 5.9h9.9c1.4 0 2.6.2 3.4 1.2h.2c-.1 0-2.1-4.1-2.3-4.7z"
      fill={`url(#${id}-d)`}
    />
    <linearGradient
      id={`${id}-e`}
      gradientUnits="userSpaceOnUse"
      x1="46.339"
      y1="57.512"
      x2="62.776"
      y2="64.32"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset=".3" stopColor="#55c3f0" />
      <stop offset=".409" stopColor="#67caf2" />
      <stop offset=".628" stopColor="#97daf6" />
      <stop offset=".76" stopColor="#b7e5f9" />
      <stop offset=".788" stopColor="#aee0f5" />
      <stop offset=".835" stopColor="#95d1ea" />
      <stop offset=".893" stopColor="#6eb9d8" />
      <stop offset=".961" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M63.2 39.1c-1-2.1-2.2-2.4-4.2-2.4H47.5l-2 5.9h16.3c1.5 0 2.5.2 3.4 1.3h.2c-.1-.1-2-4.3-2.2-4.8z"
      fill={`url(#${id}-e)`}
    />
    <linearGradient
      id={`${id}-f`}
      gradientUnits="userSpaceOnUse"
      x1="43.845"
      y1="47.995"
      x2="65.663"
      y2="57.032"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#73cdf3" />
      <stop offset=".115" stopColor="#62c8f1" />
      <stop offset=".242" stopColor="#58c4f0" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".497" stopColor="#67caf2" />
      <stop offset=".692" stopColor="#97daf6" />
      <stop offset=".81" stopColor="#b7e5f9" />
      <stop offset=".832" stopColor="#aee0f5" />
      <stop offset=".869" stopColor="#95d1ea" />
      <stop offset=".915" stopColor="#6eb9d8" />
      <stop offset=".969" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M66.9 47.8c-1-2.3-2.3-2.7-4.3-2.7h-18L43 50c-.1.4-.2.7-.4 1h22.7c1.3 0 2.4.2 3.2 1.3h.2c0 .1-1.7-4.2-1.8-4.5z"
      fill={`url(#${id}-f)`}
    />
  </g>
);
export const logoLight = ({ id }: { id: string }) => (
  <svg viewBox="0.5 0.3 82.1 98.5" fill="#111111">
    <path
      d="M82.6 95.5c0 1.8-1.5 3.3-3.3 3.3H3.8C2 98.8.5 97.3.5 95.5V3.6C.5 1.8 2 .3 3.8.3h75.5c1.8 0 3.3 1.5 3.3 3.3v91.9z"
      fill="#ffc800"
    />
    <path
      d="M78.7 92.7c0 1.2-1 2.2-2.2 2.2H6.7c-1.2 0-2.2-1-2.2-2.2V6.4c0-1.2 1-2.2 2.2-2.2h69.7c1.2 0 2.2 1 2.2 2.2v86.3h.1z"
      fill="#ff7800"
    />
    <path
      d="M75.7 90.5c0 .9-.7 1.6-1.6 1.6H9c-.9 0-1.6-.7-1.6-1.6V8.7C7.4 7.8 8.1 7 9 7h65.1c.9 0 1.6.7 1.6 1.6v81.9z"
      fill="#d70000"
    />
    <path
      d="M73.4 88.6c0 .7-.6 1.2-1.2 1.2H11c-.7 0-1.2-.6-1.2-1.2V10.5c0-.7.6-1.2 1.2-1.2h61.2c.7 0 1.2.6 1.2 1.2v78.1z"
      fill="#00005f"
    />
    <path
      d="M26.7 76.8c-.2-.8-.5-2.2-.7-2.8h-5.4c-.2.6-.5 2-.7 2.8H15c2.1-6.5 3-9.3 5.3-15.1h6c2.3 5.8 3.3 8.6 5.3 15.1h-4.9zm-5.5-6.1h4.1c-.6-2-1.7-5.4-2-6.3-.5.9-1.5 4.3-2.1 6.3zm15.7 6.1c-2.5 0-3.9-1.4-3.9-4.1v-11h4.6v10.2c0 1.3.3 1.6 1.7 1.6h4.4l.7 3.4-7.5-.1zm25.9-15.1h4.6v15.1h-4.6zM46.2 76.8V61.7h6.3c4.6 0 7.9 1.9 7.9 7.4 0 5.4-2.6 7.7-7.7 7.7h-6.5zm4.6-3.3H52c2.8 0 3.9-1.3 3.9-4.4 0-3-1.4-4.2-4.1-4.2h-1.1l.1 8.6z"
      fill="#fff"
    />
    <linearGradient
      id={`${id}-a`}
      gradientUnits="userSpaceOnUse"
      x1="33.2"
      y1="46.8"
      x2="33.2"
      y2="84.6"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M39.8 17.4c-2.8 0-4 1.9-5 5.1l-9.7 28.4c-.8 2.4-1.9 3.9-3.6 4.1v.2h5c2.8 0 4-1.9 5-5.1l9.7-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-a)`}
    />
    <linearGradient
      id={`${id}-b`}
      gradientUnits="userSpaceOnUse"
      x1="42.35"
      y1="46.896"
      x2="42.35"
      y2="84.643"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M48.9 17.4c-2.8 0-4 1.9-5 5.1l-9.6 28.4c-.8 2.4-1.9 3.9-3.6 4.1v.2h5c2.8 0 4-1.9 5-5.1l9.6-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-b)`}
    />
    <linearGradient
      id={`${id}-c`}
      gradientUnits="userSpaceOnUse"
      x1="25.2"
      y1="46.7"
      x2="25.2"
      y2="84.5"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M30.7 17.5c-2.8 0-4 1.9-5 5.1L14.6 55.3h2.8c2.8 0 4-1.9 5-5.1l9.7-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-c)`}
    />
    <linearGradient
      id={`${id}-d`}
      gradientUnits="userSpaceOnUse"
      x1="48.704"
      y1="67.166"
      x2="59.718"
      y2="71.728"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset=".2" stopColor="#55c3f0" />
      <stop offset=".316" stopColor="#67caf2" />
      <stop offset=".549" stopColor="#97daf6" />
      <stop offset=".69" stopColor="#b7e5f9" />
      <stop offset=".727" stopColor="#aee0f5" />
      <stop offset=".786" stopColor="#95d1ea" />
      <stop offset=".862" stopColor="#6eb9d8" />
      <stop offset=".949" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M59.6 30.6c-1.1-2.1-2.2-2.4-4.2-2.4h-5l-2 5.9h9.9c1.4 0 2.6.2 3.4 1.2h.2c-.1 0-2.1-4.1-2.3-4.7z"
      fill={`url(#${id}-d)`}
    />
    <linearGradient
      id={`${id}-e`}
      gradientUnits="userSpaceOnUse"
      x1="46.339"
      y1="57.512"
      x2="62.776"
      y2="64.32"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset=".3" stopColor="#55c3f0" />
      <stop offset=".409" stopColor="#67caf2" />
      <stop offset=".628" stopColor="#97daf6" />
      <stop offset=".76" stopColor="#b7e5f9" />
      <stop offset=".788" stopColor="#aee0f5" />
      <stop offset=".835" stopColor="#95d1ea" />
      <stop offset=".893" stopColor="#6eb9d8" />
      <stop offset=".961" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M63.2 39.1c-1-2.1-2.2-2.4-4.2-2.4H47.5l-2 5.9h16.3c1.5 0 2.5.2 3.4 1.3h.2c-.1-.1-2-4.3-2.2-4.8z"
      fill={`url(#${id}-e)`}
    />
    <linearGradient
      id={`${id}-f`}
      gradientUnits="userSpaceOnUse"
      x1="43.845"
      y1="47.995"
      x2="65.663"
      y2="57.032"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#73cdf3" />
      <stop offset=".115" stopColor="#62c8f1" />
      <stop offset=".242" stopColor="#58c4f0" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".497" stopColor="#67caf2" />
      <stop offset=".692" stopColor="#97daf6" />
      <stop offset=".81" stopColor="#b7e5f9" />
      <stop offset=".832" stopColor="#aee0f5" />
      <stop offset=".869" stopColor="#95d1ea" />
      <stop offset=".915" stopColor="#6eb9d8" />
      <stop offset=".969" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M66.9 47.8c-1-2.3-2.3-2.7-4.3-2.7h-18L43 50c-.1.4-.2.7-.4 1h22.7c1.3 0 2.4.2 3.2 1.3h.2c0 .1-1.7-4.2-1.8-4.5z"
      fill={`url(#${id}-f)`}
    />
  </svg>
);
export const logoDark = ({ id }: { id: string }) => (
  <svg viewBox="0.5 0.3 82.1 98.5" fill="#F5F7FA">
    <path
      d="M82.6 95.5c0 1.8-1.5 3.3-3.3 3.3H3.8C2 98.8.5 97.3.5 95.5V3.6C.5 1.8 2 .3 3.8.3h75.5c1.8 0 3.3 1.5 3.3 3.3v91.9z"
      fill="#ffc800"
    />
    <path
      d="M78.7 92.7c0 1.2-1 2.2-2.2 2.2H6.7c-1.2 0-2.2-1-2.2-2.2V6.4c0-1.2 1-2.2 2.2-2.2h69.7c1.2 0 2.2 1 2.2 2.2v86.3h.1z"
      fill="#ff7800"
    />
    <path
      d="M75.7 90.5c0 .9-.7 1.6-1.6 1.6H9c-.9 0-1.6-.7-1.6-1.6V8.7C7.4 7.8 8.1 7 9 7h65.1c.9 0 1.6.7 1.6 1.6v81.9z"
      fill="#d70000"
    />
    <path
      d="M73.4 88.6c0 .7-.6 1.2-1.2 1.2H11c-.7 0-1.2-.6-1.2-1.2V10.5c0-.7.6-1.2 1.2-1.2h61.2c.7 0 1.2.6 1.2 1.2v78.1z"
      fill="#00005f"
    />
    <path
      d="M26.7 76.8c-.2-.8-.5-2.2-.7-2.8h-5.4c-.2.6-.5 2-.7 2.8H15c2.1-6.5 3-9.3 5.3-15.1h6c2.3 5.8 3.3 8.6 5.3 15.1h-4.9zm-5.5-6.1h4.1c-.6-2-1.7-5.4-2-6.3-.5.9-1.5 4.3-2.1 6.3zm15.7 6.1c-2.5 0-3.9-1.4-3.9-4.1v-11h4.6v10.2c0 1.3.3 1.6 1.7 1.6h4.4l.7 3.4-7.5-.1zm25.9-15.1h4.6v15.1h-4.6zM46.2 76.8V61.7h6.3c4.6 0 7.9 1.9 7.9 7.4 0 5.4-2.6 7.7-7.7 7.7h-6.5zm4.6-3.3H52c2.8 0 3.9-1.3 3.9-4.4 0-3-1.4-4.2-4.1-4.2h-1.1l.1 8.6z"
      fill="#fff"
    />
    <linearGradient
      id={`${id}-a`}
      gradientUnits="userSpaceOnUse"
      x1="33.2"
      y1="46.8"
      x2="33.2"
      y2="84.6"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M39.8 17.4c-2.8 0-4 1.9-5 5.1l-9.7 28.4c-.8 2.4-1.9 3.9-3.6 4.1v.2h5c2.8 0 4-1.9 5-5.1l9.7-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-a)`}
    />
    <linearGradient
      id={`${id}-b`}
      gradientUnits="userSpaceOnUse"
      x1="42.35"
      y1="46.896"
      x2="42.35"
      y2="84.643"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M48.9 17.4c-2.8 0-4 1.9-5 5.1l-9.6 28.4c-.8 2.4-1.9 3.9-3.6 4.1v.2h5c2.8 0 4-1.9 5-5.1l9.6-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-b)`}
    />
    <linearGradient
      id={`${id}-c`}
      gradientUnits="userSpaceOnUse"
      x1="25.2"
      y1="46.7"
      x2="25.2"
      y2="84.5"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#1482af" />
      <stop offset=".02" stopColor="#3798bf" />
      <stop offset=".054" stopColor="#6eb9d8" />
      <stop offset=".083" stopColor="#95d1ea" />
      <stop offset=".106" stopColor="#aee0f5" />
      <stop offset=".12" stopColor="#b7e5f9" />
      <stop offset=".2" stopColor="#97daf6" />
      <stop offset=".334" stopColor="#67caf2" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".6" stopColor="#55c3f0" />
      <stop offset=".666" stopColor="#67caf2" />
      <stop offset=".8" stopColor="#97daf6" />
      <stop offset=".88" stopColor="#b7e5f9" />
      <stop offset=".894" stopColor="#aee0f5" />
      <stop offset=".917" stopColor="#95d1ea" />
      <stop offset=".947" stopColor="#6eb9d8" />
      <stop offset=".98" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M30.7 17.5c-2.8 0-4 1.9-5 5.1L14.6 55.3h2.8c2.8 0 4-1.9 5-5.1l9.7-28.4c.8-2.4 2-3.9 3.7-4.1v-.2h-5.1z"
      fill={`url(#${id}-c)`}
    />
    <linearGradient
      id={`${id}-d`}
      gradientUnits="userSpaceOnUse"
      x1="48.704"
      y1="67.166"
      x2="59.718"
      y2="71.728"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset=".2" stopColor="#55c3f0" />
      <stop offset=".316" stopColor="#67caf2" />
      <stop offset=".549" stopColor="#97daf6" />
      <stop offset=".69" stopColor="#b7e5f9" />
      <stop offset=".727" stopColor="#aee0f5" />
      <stop offset=".786" stopColor="#95d1ea" />
      <stop offset=".862" stopColor="#6eb9d8" />
      <stop offset=".949" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M59.6 30.6c-1.1-2.1-2.2-2.4-4.2-2.4h-5l-2 5.9h9.9c1.4 0 2.6.2 3.4 1.2h.2c-.1 0-2.1-4.1-2.3-4.7z"
      fill={`url(#${id}-d)`}
    />
    <linearGradient
      id={`${id}-e`}
      gradientUnits="userSpaceOnUse"
      x1="46.339"
      y1="57.512"
      x2="62.776"
      y2="64.32"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset=".3" stopColor="#55c3f0" />
      <stop offset=".409" stopColor="#67caf2" />
      <stop offset=".628" stopColor="#97daf6" />
      <stop offset=".76" stopColor="#b7e5f9" />
      <stop offset=".788" stopColor="#aee0f5" />
      <stop offset=".835" stopColor="#95d1ea" />
      <stop offset=".893" stopColor="#6eb9d8" />
      <stop offset=".961" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M63.2 39.1c-1-2.1-2.2-2.4-4.2-2.4H47.5l-2 5.9h16.3c1.5 0 2.5.2 3.4 1.3h.2c-.1-.1-2-4.3-2.2-4.8z"
      fill={`url(#${id}-e)`}
    />
    <linearGradient
      id={`${id}-f`}
      gradientUnits="userSpaceOnUse"
      x1="43.845"
      y1="47.995"
      x2="65.663"
      y2="57.032"
      gradientTransform="matrix(1 0 0 -1 0 102)"
    >
      <stop offset="0" stopColor="#73cdf3" />
      <stop offset=".115" stopColor="#62c8f1" />
      <stop offset=".242" stopColor="#58c4f0" />
      <stop offset=".4" stopColor="#55c3f0" />
      <stop offset=".497" stopColor="#67caf2" />
      <stop offset=".692" stopColor="#97daf6" />
      <stop offset=".81" stopColor="#b7e5f9" />
      <stop offset=".832" stopColor="#aee0f5" />
      <stop offset=".869" stopColor="#95d1ea" />
      <stop offset=".915" stopColor="#6eb9d8" />
      <stop offset=".969" stopColor="#3798bf" />
      <stop offset="1" stopColor="#1482af" />
    </linearGradient>
    <path
      d="M66.9 47.8c-1-2.3-2.3-2.7-4.3-2.7h-18L43 50c-.1.4-.2.7-.4 1h22.7c1.3 0 2.4.2 3.2 1.3h.2c0 .1-1.7-4.2-1.8-4.5z"
      fill={`url(#${id}-f)`}
    />
  </svg>
);
