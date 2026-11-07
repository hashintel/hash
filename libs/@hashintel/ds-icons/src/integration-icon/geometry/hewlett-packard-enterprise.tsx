/* Brand names and artwork remain trademarks of their respective owners. Bounds and theme colors adjusted; app tiles composed. */
export const markLight = ({ id: _id }: { id: string }) => (
  <g strokeWidth="36" fill="#111111">
    <path
      fill="none"
      stroke="#000000"
      d="M18 180V0m154 180V0M18 89h137m95 91V0m0 18h102a32 32 0 0 1 0 100H250m222-67V18h158"
    />
    <path fill="none" stroke="#03A883" d="M630 162H472V86h158" />
  </g>
);
export const markDark = ({ id: _id }: { id: string }) => (
  <g strokeWidth="36" fill="#F5F7FA">
    <path
      fill="none"
      stroke="#F5F7FA"
      d="M18 180V0m154 180V0M18 89h137m95 91V0m0 18h102a32 32 0 0 1 0 100H250m222-67V18h158"
    />
    <path fill="none" stroke="#03A883" d="M630 162H472V86h158" />
  </g>
);
export const logoLight = ({ id: _id }: { id: string }) => (
  <svg strokeWidth="36" viewBox="0 0 630 180" fill="#111111">
    <path
      fill="none"
      stroke="#000000"
      d="M18 180V0m154 180V0M18 89h137m95 91V0m0 18h102a32 32 0 0 1 0 100H250m222-67V18h158"
    />
    <path fill="none" stroke="#03A883" d="M630 162H472V86h158" />
  </svg>
);
export const logoDark = ({ id: _id }: { id: string }) => (
  <svg strokeWidth="36" viewBox="0 0 630 180" fill="#F5F7FA">
    <path
      fill="none"
      stroke="#F5F7FA"
      d="M18 180V0m154 180V0M18 89h137m95 91V0m0 18h102a32 32 0 0 1 0 100H250m222-67V18h158"
    />
    <path fill="none" stroke="#03A883" d="M630 162H472V86h158" />
  </svg>
);
export const wordmarkLight = logoLight;
export const wordmarkDark = logoDark;
