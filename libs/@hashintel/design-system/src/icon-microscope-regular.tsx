import type { SvgIconProps } from "@mui/material";
import { SvgIcon } from "@mui/material";
import type { FunctionComponent } from "react";

export const MicroscopeRegularIcon: FunctionComponent<SvgIconProps> = (
  props,
) => {
  return (
    <SvgIcon
      width="512"
      height="512"
      viewBox="0 0 512 512"
      fill="none"
      {...props}
    >
      <path d="M192 0c-17.7 0-32 14.3-32 32c-17.7 0-32 14.3-32 32V288c0 17.7 14.3 32 32 32c0 17.7 14.3 32 32 32h32c17.7 0 32-14.3 32-32c17.7 0 32-14.3 32-32V64c0-17.7-14.3-32-32-32c0-17.7-14.3-32-32-32H192zM176 272V80h64V272H176zM24 464c-13.3 0-24 10.7-24 24s10.7 24 24 24H320 488c13.3 0 24-10.7 24-24s-10.7-24-24-24H447c39.9-35.2 65-86.7 65-144c0-106-86-192-192-192h0v48h0c79.5 0 144 64.5 144 144s-64.5 144-144 144h0H24zm72-56c0 13.3 10.7 24 24 24H296c13.3 0 24-10.7 24-24s-10.7-24-24-24H120c-13.3 0-24 10.7-24 24z" />
    </SvgIcon>
  );
};
