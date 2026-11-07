/* Brand names and artwork remain trademarks of their respective owners. Bounds and theme colors adjusted; app tiles composed. */
export const markLight = ({ id: _id }: { id: string }) => (
  <g fill="#111111">
    <g fill="none" fillRule="evenodd">
      <path
        d="M57.412 42.757a7.83 7.83 0 01-7.824 7.824 7.83 7.83 0 01-7.823-7.824 7.83 7.83 0 017.823-7.823c4.384.067 7.824 3.507 7.824 7.823z"
        fill="#FFD207"
        fillRule="nonzero"
      />
      <path
        d="M30.336 13c8.57 0 14.327 4.389 14.396 11.529.026.745-.044 1.6-.21 2.564a14.678 14.678 0 01-.681 2.61c-2.194 6.158-8.09 9.826-15.767 9.826h-7.061l-1.577 9.236H6L12.033 13h18.303zm-3.565 8.777h-2.81l-1.508 8.909H25.4c3.36 0 5.416-1.965 5.759-4.454.342-2.162-1.234-4.455-4.388-4.455z"
        fill="#D51317"
      />
    </g>
  </g>
);
export const markDark = ({ id: _id }: { id: string }) => (
  <g fill="#F5F7FA">
    <g fill="none" fillRule="evenodd">
      <path
        d="M57.412 42.757a7.83 7.83 0 01-7.824 7.824 7.83 7.83 0 01-7.823-7.824 7.83 7.83 0 017.823-7.823c4.384.067 7.824 3.507 7.824 7.823z"
        fill="#FFD207"
        fillRule="nonzero"
      />
      <path
        d="M30.336 13c8.57 0 14.327 4.389 14.396 11.529.026.745-.044 1.6-.21 2.564a14.678 14.678 0 01-.681 2.61c-2.194 6.158-8.09 9.826-15.767 9.826h-7.061l-1.577 9.236H6L12.033 13h18.303zm-3.565 8.777h-2.81l-1.508 8.909H25.4c3.36 0 5.416-1.965 5.759-4.454.342-2.162-1.234-4.455-4.388-4.455z"
        fill="#DE4347"
      />
    </g>
  </g>
);
export const logoLight = ({ id: _id }: { id: string }) => (
  <svg fill="none" viewBox="0 0 165 31.67059">
    <path
      fill="#FFD207"
      d="M164.788 24.983c0 3.592-3.053 6.512-6.812 6.512-3.758 0-6.812-2.92-6.812-6.512 0-3.593 3.054-6.513 6.812-6.513 3.817.056 6.812 2.92 6.812 6.513"
    />
    <path
      fill="#D51317"
      fillRule="evenodd"
      d="M14.095 15.158h2.525c2.877 0 4.64-1.684 4.933-3.818.293-1.852-1.057-3.817-3.759-3.817h-2.408zm127.79-4.38L147.64.45h13.214l-19.967 30.204h-13.449l6.401-8.646-7.341-20.94-4.991 29.586h-10.571l-6.519-13.98-2.349 13.98H91.497L96.607.449h10.864l6.284 13.53 2.29-13.53h23.138zM92.378.45l-5.11 30.204h-10.57l-6.519-13.98-2.35 13.98H57.26L62.369.449h10.864l6.284 13.53 2.29-13.53zM20.848 0c7.341 0 12.274 3.761 12.333 9.88L34.767.45h23.96l-1.292 7.634H44.75l-.646 3.593h11.452l-1.292 7.58H42.812l-.646 3.76h12.861l-1.292 7.636H29.657l2.76-16.337c-1.879 5.277-6.93 8.42-13.507 8.42h-6.049l-1.35 7.917H0L5.168 0z"
      clipRule="evenodd"
    />
  </svg>
);
export const logoDark = ({ id: _id }: { id: string }) => (
  <svg fill="none" viewBox="0 0 165 31.67059">
    <path
      fill="#FFD207"
      d="M164.788 24.983c0 3.592-3.053 6.512-6.812 6.512-3.758 0-6.812-2.92-6.812-6.512 0-3.593 3.054-6.513 6.812-6.513 3.817.056 6.812 2.92 6.812 6.513"
    />
    <path
      fill="#DE4347"
      fillRule="evenodd"
      d="M14.095 15.158h2.525c2.877 0 4.64-1.684 4.933-3.818.293-1.852-1.057-3.817-3.759-3.817h-2.408zm127.79-4.38L147.64.45h13.214l-19.967 30.204h-13.449l6.401-8.646-7.341-20.94-4.991 29.586h-10.571l-6.519-13.98-2.349 13.98H91.497L96.607.449h10.864l6.284 13.53 2.29-13.53h23.138zM92.378.45l-5.11 30.204h-10.57l-6.519-13.98-2.35 13.98H57.26L62.369.449h10.864l6.284 13.53 2.29-13.53zM20.848 0c7.341 0 12.274 3.761 12.333 9.88L34.767.45h23.96l-1.292 7.634H44.75l-.646 3.593h11.452l-1.292 7.58H42.812l-.646 3.76h12.861l-1.292 7.636H29.657l2.76-16.337c-1.879 5.277-6.93 8.42-13.507 8.42h-6.049l-1.35 7.917H0L5.168 0z"
      clipRule="evenodd"
    />
  </svg>
);
const WordmarkLightSource = logoLight;
export const wordmarkLight = ({ id }: { id: string }) => (
  <svg viewBox="0 0 164.90375 31.02341" overflow="hidden">
    <defs>
      <clipPath id={`${id}-wordmark-crop`} clipPathUnits="userSpaceOnUse">
        <rect x="0" y="0" width="164.90375" height="31.02341" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-wordmark-crop)`}>
      <svg x="0" y="0" width="165" height="31.67059">
        <WordmarkLightSource id={id} />
      </svg>
    </g>
  </svg>
);
const WordmarkDarkSource = logoDark;
export const wordmarkDark = ({ id }: { id: string }) => (
  <svg viewBox="0 0 164.90375 31.02341" overflow="hidden">
    <defs>
      <clipPath id={`${id}-wordmark-crop`} clipPathUnits="userSpaceOnUse">
        <rect x="0" y="0" width="164.90375" height="31.02341" />
      </clipPath>
    </defs>
    <g clipPath={`url(#${id}-wordmark-crop)`}>
      <svg x="0" y="0" width="165" height="31.67059">
        <WordmarkDarkSource id={id} />
      </svg>
    </g>
  </svg>
);
