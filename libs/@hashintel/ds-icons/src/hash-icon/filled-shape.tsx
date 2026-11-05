import { createContext, use, useId } from "react";

import type { ReactNode } from "react";

export const IconFillContext = createContext(false);

export const FilledShape = ({
  children,
  cutout,
}: {
  children: ReactNode;
  cutout?: ReactNode;
}) => {
  const filled = use(IconFillContext);
  const maskId = useId();

  if (!filled) {
    return (
      <>
        {children}
        {cutout}
      </>
    );
  }

  return (
    <>
      {cutout && (
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x="-4"
            y="-4"
            width="32"
            height="32"
            style={{ maskType: "luminance" }}
          >
            <rect
              x="-4"
              y="-4"
              width="32"
              height="32"
              fill="white"
              stroke="none"
            />
            <g color="black" fill="none" stroke="black">
              {cutout}
            </g>
          </mask>
        </defs>
      )}
      <g fill="currentColor" mask={cutout ? `url(#${maskId})` : undefined}>
        {children}
      </g>
    </>
  );
};
